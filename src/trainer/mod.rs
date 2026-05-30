mod copy;
mod stats;
mod terminal;

use crate::content;
use crate::metrics;
use crate::model::{
    CodePracticeConfig, CodePracticeFacet, CodePracticeOption, DailyPracticePlan, KeyAction,
    KeyEventRecord, Language, LessonKind, Mode, PracticeLesson, PracticeTarget, SessionRecord,
};
use anyhow::Result;
use chrono::{DateTime, NaiveDate, Utc};
use copy::{lesson_color, lesson_purpose, lesson_title, text};
use crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};
use ratatui::Frame;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, Borders, Gauge, Paragraph, Wrap};
use stats::*;
use std::time::{Duration, Instant};
use terminal::Tui;

const PRACTICE_PANEL_MAX_WIDTH: u16 = 92;
const MIN_TERMINAL_WIDTH: u16 = 72;
const MIN_TERMINAL_HEIGHT: u16 = 25;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Menu,
    Plan,
    CodeSetup,
    Stats,
    Running,
    Complete,
    Summary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StatsView {
    Overview,
    Details,
}

struct App {
    phase: Phase,
    language: Language,
    plan: DailyPracticePlan,
    records: Vec<SessionRecord>,
    menu_index: usize,
    stats_view: StatsView,
    stats_day_index: usize,
    code_options: Vec<CodePracticeOption>,
    code_filter_index: usize,
    code_selected: Vec<bool>,
    code_specialist_active: bool,
    code_group_count: usize,
    single_lesson: Option<usize>,
    lesson_index: usize,
    target: Option<PracticeTarget>,
    target_chars: Vec<char>,
    input: Vec<char>,
    events: Vec<KeyEventRecord>,
    started_at: Option<DateTime<Utc>>,
    started: Option<Instant>,
    paused_at: Option<Instant>,
    paused_total: Duration,
    completed_records: Vec<SessionRecord>,
    completed_lesson_indices: Vec<usize>,
    ignored_non_ascii: u32,
    exit_confirm: bool,
    quit: bool,
}

impl App {
    fn new(
        plan: DailyPracticePlan,
        records: Vec<SessionRecord>,
        language: Language,
        code_options: Vec<CodePracticeOption>,
    ) -> Self {
        let code_selected = vec![false; code_options.len()];
        Self {
            phase: Phase::Menu,
            language,
            plan,
            records,
            menu_index: 0,
            stats_view: StatsView::Overview,
            stats_day_index: 0,
            code_options,
            code_filter_index: 0,
            code_selected,
            code_specialist_active: false,
            code_group_count: 0,
            single_lesson: None,
            lesson_index: 0,
            target: None,
            target_chars: Vec::new(),
            input: Vec::new(),
            events: Vec::new(),
            started_at: None,
            started: None,
            paused_at: None,
            paused_total: Duration::ZERO,
            completed_records: Vec::new(),
            completed_lesson_indices: Vec::new(),
            ignored_non_ascii: 0,
            exit_confirm: false,
            quit: false,
        }
    }

    fn current_lesson(&self) -> Option<&PracticeLesson> {
        self.plan.lessons.get(self.lesson_index)
    }

    fn menu_len(&self) -> usize {
        self.plan.lessons.len() + 3
    }

    fn code_specialist_menu_index(&self) -> usize {
        self.plan.lessons.len() + 1
    }

    fn stats_menu_index(&self) -> usize {
        self.plan.lessons.len() + 2
    }

    fn completed_today_ms(&self) -> u64 {
        self.plan.completed_ms
            + self
                .completed_records
                .iter()
                .map(|record| record.duration_ms)
                .sum::<u64>()
    }

    fn target_minutes(&self) -> u16 {
        self.plan.target_minutes
    }

    fn begin_current(&mut self) {
        let Some(lesson) = self.current_lesson() else {
            self.phase = Phase::Summary;
            return;
        };

        let target = lesson.target.clone();
        self.begin_target(target);
    }

    fn begin_target(&mut self, target: PracticeTarget) {
        self.target_chars = target.text.chars().collect();
        self.target = Some(target);
        self.input.clear();
        self.events.clear();
        self.ignored_non_ascii = 0;
        self.exit_confirm = false;
        self.started_at = Some(Utc::now());
        self.started = Some(Instant::now());
        self.paused_at = None;
        self.paused_total = Duration::ZERO;
        self.phase = Phase::Running;
    }

    fn repeat_current(&mut self) {
        self.begin_current();
    }

    fn begin_next(&mut self) {
        if self.code_specialist_active {
            self.begin_next_code_group();
            return;
        }
        if self.single_lesson.is_some() {
            self.phase = Phase::Summary;
            return;
        }
        if self.lesson_index + 1 >= self.plan.lessons.len() {
            self.phase = Phase::Summary;
            return;
        }
        self.lesson_index += 1;
        self.begin_current();
    }

    fn begin_code_specialist(&mut self) {
        self.code_specialist_active = true;
        self.code_group_count = 0;
        self.single_lesson = Some(self.code_lesson_index());
        self.lesson_index = self.code_lesson_index();
        self.begin_next_code_group();
    }

    fn begin_next_code_group(&mut self) {
        let config = self.selected_code_config();
        let records = self.all_records();
        let target =
            content::build_code_specialist_target(&records, &config, 4).unwrap_or_else(|error| {
                PracticeTarget {
                    mode: Mode::Code,
                    text: "function retryLater() {\n  return true;\n}".to_string(),
                    source: format!("keyloop:code-specialist-error:{error}"),
                }
            });
        self.code_group_count += 1;
        self.begin_target(target);
    }

    fn code_lesson_index(&self) -> usize {
        self.plan
            .lessons
            .iter()
            .position(|lesson| lesson.kind == LessonKind::CodeBlock)
            .unwrap_or_else(|| self.plan.lessons.len().saturating_sub(1))
    }

    fn selected_code_config(&self) -> CodePracticeConfig {
        let mut config = CodePracticeConfig {
            match_any: true,
            ..CodePracticeConfig::default()
        };
        for (option, selected) in self.code_options.iter().zip(self.code_selected.iter()) {
            if !selected {
                continue;
            }
            match option.facet {
                CodePracticeFacet::Language => config.languages.push(option.value.clone()),
                CodePracticeFacet::Framework => config.frameworks.push(option.value.clone()),
                CodePracticeFacet::Project => config.projects.push(option.value.clone()),
            }
        }
        config
    }

    fn selected_code_labels(&self) -> Vec<String> {
        self.code_options
            .iter()
            .zip(self.code_selected.iter())
            .filter(|(_, selected)| **selected)
            .map(|(option, _)| option.value.clone())
            .collect()
    }

    fn current_record(&self) -> Option<SessionRecord> {
        let target = self.target.clone()?;
        let started_at = self.started_at?;

        let duration_ms = self.active_elapsed_ms()?;
        let user_input = self.input.iter().collect::<String>();
        Some(metrics::build_session_record(
            target,
            started_at,
            duration_ms,
            user_input,
            self.events.clone(),
        ))
    }

    fn complete(&mut self) {
        let Some(record) = self.current_record() else {
            return;
        };
        self.completed_records.push(record);
        self.completed_lesson_indices.push(self.lesson_index);
        self.exit_confirm = false;
        self.phase = Phase::Complete;
    }

    fn save_partial_and_quit(&mut self) {
        if !self.input.is_empty()
            && let Some(record) = self.current_record()
        {
            self.completed_records.push(record);
        }
        self.exit_confirm = false;
        self.quit = true;
    }

    fn pause(&mut self) {
        if self.paused_at.is_none() {
            self.paused_at = Some(Instant::now());
        }
    }

    fn resume(&mut self) {
        if let Some(paused_at) = self.paused_at.take() {
            self.paused_total += paused_at.elapsed();
        }
        self.exit_confirm = false;
    }

    fn is_paused(&self) -> bool {
        self.paused_at.is_some()
    }

    fn active_elapsed(&self) -> Option<Duration> {
        let started = self.started?;
        let current_pause = self
            .paused_at
            .map(|paused_at| paused_at.elapsed())
            .unwrap_or_default();
        let paused = self.paused_total.saturating_add(current_pause);
        Some(started.elapsed().saturating_sub(paused))
    }

    fn active_elapsed_ms(&self) -> Option<u64> {
        self.active_elapsed().map(duration_ms)
    }

    fn reset_to_menu(&mut self) {
        self.phase = Phase::Menu;
        self.single_lesson = None;
        self.code_specialist_active = false;
        self.code_group_count = 0;
        self.lesson_index = 0;
        self.target = None;
        self.target_chars.clear();
        self.input.clear();
        self.events.clear();
        self.started_at = None;
        self.started = None;
        self.paused_at = None;
        self.paused_total = Duration::ZERO;
        self.ignored_non_ascii = 0;
        self.exit_confirm = false;
    }

    fn choose_menu_item(&mut self) {
        if self.menu_index == 0 {
            self.single_lesson = None;
            self.lesson_index = 0;
            self.phase = Phase::Plan;
            return;
        }
        if self.menu_index == self.code_specialist_menu_index() {
            self.phase = Phase::CodeSetup;
            return;
        }
        if self.menu_index == self.stats_menu_index() {
            self.phase = Phase::Stats;
            self.stats_view = StatsView::Overview;
            self.clamp_stats_day();
            return;
        }

        let lesson_index = self
            .menu_index
            .saturating_sub(1)
            .min(self.plan.lessons.len().saturating_sub(1));
        self.single_lesson = Some(lesson_index);
        self.lesson_index = lesson_index;
        self.begin_current();
    }

    fn all_records(&self) -> Vec<&SessionRecord> {
        self.records
            .iter()
            .chain(self.completed_records.iter())
            .collect()
    }

    fn stats_dates(&self) -> Vec<NaiveDate> {
        stats_dates_from_records(&self.all_records())
    }

    fn clamp_stats_day(&mut self) {
        let len = self.stats_dates().len();
        if len == 0 {
            self.stats_day_index = 0;
        } else {
            self.stats_day_index = self.stats_day_index.min(len - 1);
        }
    }
}

pub fn run(
    plan: DailyPracticePlan,
    records: Vec<SessionRecord>,
    language: Language,
) -> Result<Vec<SessionRecord>> {
    let mut tui = Tui::enter()?;
    let code_options = content::code_practice_options()?;
    let mut app = App::new(plan, records, language, code_options);

    draw(&mut tui, &app)?;

    loop {
        if !event::poll(Duration::from_millis(250))? {
            if app.phase == Phase::Running {
                draw(&mut tui, &app)?;
            }
            continue;
        }

        match event::read()? {
            Event::Key(key) => {
                if key.kind != KeyEventKind::Press {
                    continue;
                }

                if key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL) {
                    break;
                }

                if matches!(key.code, KeyCode::Char('l') | KeyCode::Char('L'))
                    && key.modifiers.contains(KeyModifiers::CONTROL)
                {
                    app.language = app.language.toggle();
                    draw(&mut tui, &app)?;
                    continue;
                }

                match app.phase {
                    Phase::Menu => handle_menu_key(&mut app, key.code),
                    Phase::Plan => handle_plan_key(&mut app, key.code),
                    Phase::CodeSetup => handle_code_setup_key(&mut app, key.code),
                    Phase::Stats => handle_stats_key(&mut app, key.code),
                    Phase::Running => handle_running_key(&mut app, key.code, key.modifiers),
                    Phase::Complete => handle_complete_key(&mut app, key.code),
                    Phase::Summary => handle_summary_key(&mut app, key.code),
                }
            }
            Event::Resize(_, _) => {}
            _ => {}
        }

        if app.quit {
            break;
        }

        if app.phase == Phase::Running && app.input.len() >= app.target_chars.len() {
            app.complete();
        }

        draw(&mut tui, &app)?;
    }

    Ok(app.completed_records)
}

fn handle_menu_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Esc | KeyCode::Char('q') => app.quit = true,
        KeyCode::Enter => app.choose_menu_item(),
        KeyCode::Up | KeyCode::Char('k') | KeyCode::Char('K') => {
            app.menu_index = app.menu_index.saturating_sub(1);
        }
        KeyCode::Down | KeyCode::Char('j') | KeyCode::Char('J') => {
            app.menu_index = (app.menu_index + 1).min(app.menu_len().saturating_sub(1));
        }
        KeyCode::Char('l') | KeyCode::Char('L') => app.language = app.language.toggle(),
        KeyCode::Char('0') if app.menu_len() >= 10 => {
            app.menu_index = 9.min(app.menu_len().saturating_sub(1));
        }
        KeyCode::Char(ch) if ('1'..='9').contains(&ch) => {
            if let Some(value) = ch.to_digit(10) {
                let index = (value - 1) as usize;
                if index < app.menu_len() {
                    app.menu_index = index;
                }
            }
        }
        _ => {}
    }
}

fn handle_plan_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Esc => app.reset_to_menu(),
        KeyCode::Char('q') => app.quit = true,
        KeyCode::Enter => app.begin_current(),
        KeyCode::Char('l') | KeyCode::Char('L') => app.language = app.language.toggle(),
        _ => {}
    }
}

fn handle_code_setup_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Esc => app.reset_to_menu(),
        KeyCode::Char('q') | KeyCode::Char('Q') => app.quit = true,
        KeyCode::Enter => app.begin_code_specialist(),
        KeyCode::Char('l') | KeyCode::Char('L') => app.language = app.language.toggle(),
        KeyCode::Up | KeyCode::Char('k') | KeyCode::Char('K') => {
            app.code_filter_index = app.code_filter_index.saturating_sub(1);
        }
        KeyCode::Down | KeyCode::Char('j') | KeyCode::Char('J') => {
            app.code_filter_index =
                (app.code_filter_index + 1).min(app.code_options.len().saturating_sub(1));
        }
        KeyCode::Char(' ') => {
            if let Some(selected) = app.code_selected.get_mut(app.code_filter_index) {
                *selected = !*selected;
            }
        }
        KeyCode::Char('a') | KeyCode::Char('A') => {
            for selected in &mut app.code_selected {
                *selected = true;
            }
        }
        KeyCode::Char('c') | KeyCode::Char('C') => {
            for selected in &mut app.code_selected {
                *selected = false;
            }
        }
        _ => {}
    }
}

fn handle_stats_key(app: &mut App, code: KeyCode) {
    let dates_len = app.stats_dates().len();
    match code {
        KeyCode::Esc => app.reset_to_menu(),
        KeyCode::Char('q') => app.quit = true,
        KeyCode::Char('l') | KeyCode::Char('L') => app.language = app.language.toggle(),
        KeyCode::Tab => {
            app.stats_view = match app.stats_view {
                StatsView::Overview => StatsView::Details,
                StatsView::Details => StatsView::Overview,
            };
        }
        KeyCode::Char('1') | KeyCode::Char('o') | KeyCode::Char('O') => {
            app.stats_view = StatsView::Overview;
        }
        KeyCode::Char('2') | KeyCode::Char('d') | KeyCode::Char('D') => {
            app.stats_view = StatsView::Details;
            app.clamp_stats_day();
        }
        KeyCode::Left | KeyCode::Char('h') | KeyCode::Char('H') | KeyCode::Char('[')
            if app.stats_view == StatsView::Details && dates_len > 0 =>
        {
            app.stats_day_index = (app.stats_day_index + 1).min(dates_len - 1);
        }
        KeyCode::Right | KeyCode::Char('j') | KeyCode::Char('J') | KeyCode::Char(']')
            if app.stats_view == StatsView::Details =>
        {
            app.stats_day_index = app.stats_day_index.saturating_sub(1);
        }
        KeyCode::Home if app.stats_view == StatsView::Details => app.stats_day_index = 0,
        KeyCode::End if app.stats_view == StatsView::Details && dates_len > 0 => {
            app.stats_day_index = dates_len - 1;
        }
        _ => {}
    }
}

fn handle_complete_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Enter => app.begin_next(),
        KeyCode::Char('r') | KeyCode::Char('R') => app.repeat_current(),
        KeyCode::Char('l') | KeyCode::Char('L') => app.language = app.language.toggle(),
        KeyCode::Esc | KeyCode::Char('q') => app.quit = true,
        _ => {}
    }
}

fn handle_summary_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Enter => app.reset_to_menu(),
        KeyCode::Esc | KeyCode::Char('q') => app.quit = true,
        KeyCode::Char('l') | KeyCode::Char('L') => app.language = app.language.toggle(),
        _ => {}
    }
}

fn handle_running_key(app: &mut App, code: KeyCode, modifiers: KeyModifiers) {
    if app.started.is_none() {
        return;
    }

    let pause_shortcut = is_pause_shortcut(code, modifiers);

    if app.exit_confirm {
        if pause_shortcut {
            app.resume();
            return;
        }
        match code {
            KeyCode::Enter | KeyCode::Char(' ') | KeyCode::Esc => app.resume(),
            KeyCode::Char('s') | KeyCode::Char('S') => app.save_partial_and_quit(),
            KeyCode::Char('m') | KeyCode::Char('M') => app.reset_to_menu(),
            KeyCode::Char('q') | KeyCode::Char('Q') => app.quit = true,
            _ => {}
        }
        return;
    }

    if app.is_paused() {
        if pause_shortcut {
            app.resume();
            return;
        }
        match code {
            KeyCode::Enter | KeyCode::Char(' ') => app.resume(),
            KeyCode::Esc | KeyCode::Char('q') | KeyCode::Char('Q') => app.exit_confirm = true,
            _ => {}
        }
        return;
    }

    if pause_shortcut {
        app.pause();
        return;
    }

    if code == KeyCode::Esc {
        app.pause();
        app.exit_confirm = true;
        return;
    }

    match code {
        KeyCode::Backspace if !app.input.is_empty() => {
            app.input.pop();
            let position = app.input.len();
            app.events.push(KeyEventRecord {
                at_ms: app.active_elapsed_ms().unwrap_or(0),
                action: KeyAction::Backspace,
                position,
                expected: app.target_chars.get(position).copied(),
                input: None,
                correct: false,
            });
        }
        KeyCode::Enter => push_char('\n', app),
        KeyCode::Tab => push_char('\t', app),
        KeyCode::Char(ch) => {
            if modifiers.contains(KeyModifiers::CONTROL) || modifiers.contains(KeyModifiers::ALT) {
                return;
            }
            if !ch.is_ascii() {
                app.ignored_non_ascii += 1;
                return;
            }
            push_char(ch, app);
        }
        _ => {}
    }
}

fn is_pause_shortcut(code: KeyCode, modifiers: KeyModifiers) -> bool {
    matches!(code, KeyCode::Char('p') | KeyCode::Char('P'))
        && modifiers.contains(KeyModifiers::CONTROL)
}

fn draw(tui: &mut Tui, app: &App) -> Result<()> {
    tui.terminal.draw(|frame| render(frame, app))?;
    Ok(())
}

fn render(frame: &mut Frame, app: &App) {
    let area = frame.area();
    if terminal_too_small(area) {
        frame.render_widget(
            Paragraph::new(text(app.language, "terminal_small")),
            frame.area(),
        );
        return;
    }

    match app.phase {
        Phase::Menu => render_menu(frame, area, app),
        Phase::Plan => render_plan(frame, area, app),
        Phase::CodeSetup => render_code_setup(frame, area, app),
        Phase::Stats => render_stats(frame, area, app),
        Phase::Running => render_running(frame, area, app),
        Phase::Complete => render_complete(frame, area, app),
        Phase::Summary => render_summary(frame, area, app),
    }
}

fn terminal_too_small(area: Rect) -> bool {
    area.width < MIN_TERMINAL_WIDTH || area.height < MIN_TERMINAL_HEIGHT
}

fn render_menu(frame: &mut Frame, area: Rect, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(4),
            Constraint::Min(11),
            Constraint::Length(3),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        None,
    );
    render_daily_progress(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );

    let mut lines = Vec::new();
    lines.push(menu_line(
        app.menu_index == 0,
        1,
        text(app.language, "menu_comprehensive"),
        text(app.language, "menu_comprehensive_hint"),
        Color::Cyan,
    ));
    for (index, lesson) in app.plan.lessons.iter().enumerate() {
        lines.push(menu_line(
            app.menu_index == index + 1,
            index + 2,
            lesson_title(lesson.kind, app.language),
            lesson_purpose(lesson.kind, app.language),
            lesson_color(lesson.kind),
        ));
    }
    lines.push(menu_line(
        app.menu_index == app.code_specialist_menu_index(),
        app.code_specialist_menu_index() + 1,
        text(app.language, "menu_code_specialist"),
        text(app.language, "menu_code_specialist_hint"),
        Color::LightMagenta,
    ));
    lines.push(menu_line(
        app.menu_index == app.stats_menu_index(),
        app.stats_menu_index() + 1,
        text(app.language, "menu_stats"),
        text(app.language, "menu_stats_hint"),
        Color::LightBlue,
    ));

    frame.render_widget(
        Paragraph::new(lines).block(
            Block::default()
                .borders(Borders::ALL)
                .title(text(app.language, "practice_menu")),
        ),
        centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH),
    );

    let help = vec![Line::from(text(app.language, "menu_help"))];
    frame.render_widget(
        Paragraph::new(help)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(text(app.language, "controls")),
            )
            .wrap(Wrap { trim: false }),
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
    );
}

fn menu_line(
    selected: bool,
    number: usize,
    title: &str,
    hint: &str,
    color: Color,
) -> Line<'static> {
    let marker = if selected { ">" } else { " " };
    let base_style = if selected {
        Style::default()
            .fg(Color::Black)
            .bg(color)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(color).add_modifier(Modifier::BOLD)
    };
    let hint_style = if selected {
        Style::default().fg(Color::Black).bg(color)
    } else {
        Style::default().fg(Color::Gray)
    };

    Line::from(vec![
        Span::styled(format!("{marker} {number}. "), base_style),
        Span::styled(title.to_string(), base_style),
        Span::styled("  ".to_string(), hint_style),
        Span::styled(hint.to_string(), hint_style),
    ])
}

fn render_plan(frame: &mut Frame, area: Rect, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(4),
            Constraint::Min(10),
            Constraint::Length(4),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        None,
    );
    render_daily_progress(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );

    let plan_area = centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH);
    let compact_lessons = plan_area.height < app.plan.lessons.len() as u16 * 2 + 2;
    let lines = app
        .plan
        .lessons
        .iter()
        .enumerate()
        .flat_map(|(index, lesson)| {
            let status = if app.completed_lesson_indices.contains(&index) {
                text(app.language, "done")
            } else if index == app.lesson_index {
                text(app.language, "next")
            } else {
                text(app.language, "pending")
            };
            let mut lesson_lines = vec![Line::from(vec![
                Span::styled(
                    format!("{}. ", index + 1),
                    Style::default().fg(Color::Yellow),
                ),
                Span::styled(
                    lesson_title(lesson.kind, app.language),
                    Style::default()
                        .fg(Color::White)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::raw(format!("  {} min  ", lesson.estimated_minutes)),
                Span::styled(status, Style::default().fg(lesson_color(lesson.kind))),
            ])];

            if !compact_lessons {
                lesson_lines.push(Line::from(vec![
                    Span::raw("   "),
                    Span::styled(
                        lesson_purpose(lesson.kind, app.language),
                        Style::default().fg(Color::Gray),
                    ),
                ]));
            }

            lesson_lines
        })
        .collect::<Vec<_>>();

    frame.render_widget(
        Paragraph::new(lines)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(text(app.language, "today_plan")),
            )
            .wrap(Wrap { trim: false }),
        plan_area,
    );

    let help = vec![
        Line::from(text(app.language, "plan_help")),
        Line::from(text(app.language, "daily_goal_hint")),
    ];
    frame.render_widget(
        Paragraph::new(help)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(text(app.language, "controls")),
            )
            .wrap(Wrap { trim: false }),
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
    );
}

fn render_code_setup(frame: &mut Frame, area: Rect, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(4),
            Constraint::Min(10),
            Constraint::Length(4),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        None,
    );
    render_daily_progress(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );

    let options_area = centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH);
    let visible_rows = options_area.height.saturating_sub(2).max(1) as usize;
    let (start, end) = visible_window(app.code_filter_index, app.code_options.len(), visible_rows);
    let mut lines = Vec::new();
    if app.code_options.is_empty() {
        lines.push(Line::from(text(app.language, "code_setup_empty")));
    } else {
        for index in start..end {
            let option = &app.code_options[index];
            let selected = app.code_selected.get(index).copied().unwrap_or(false);
            lines.push(code_option_line(
                index == app.code_filter_index,
                selected,
                option,
                app.language,
            ));
        }
    }

    frame.render_widget(
        Paragraph::new(lines)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(text(app.language, "code_setup_title")),
            )
            .wrap(Wrap { trim: false }),
        options_area,
    );

    let selected = app.selected_code_labels();
    let summary = if selected.is_empty() {
        text(app.language, "code_setup_all").to_string()
    } else {
        selected.into_iter().take(8).collect::<Vec<_>>().join(", ")
    };
    let help = vec![
        Line::from(vec![
            Span::styled(
                text(app.language, "code_setup_selected"),
                Style::default()
                    .fg(Color::LightMagenta)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(format!("  {summary}")),
        ]),
        Line::from(text(app.language, "code_setup_help")),
    ];
    frame.render_widget(
        Paragraph::new(help)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(text(app.language, "controls")),
            )
            .wrap(Wrap { trim: false }),
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
    );
}

fn code_option_line(
    active: bool,
    selected: bool,
    option: &CodePracticeOption,
    language: Language,
) -> Line<'static> {
    let marker = if active { ">" } else { " " };
    let checkbox = if selected { "[x]" } else { "[ ]" };
    let color = match option.facet {
        CodePracticeFacet::Language => Color::Cyan,
        CodePracticeFacet::Framework => Color::LightGreen,
        CodePracticeFacet::Project => Color::Yellow,
    };
    let base_style = if active {
        Style::default()
            .fg(Color::Black)
            .bg(color)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(color)
    };
    let subtle_style = if active {
        Style::default().fg(Color::Black).bg(color)
    } else {
        Style::default().fg(Color::Gray)
    };

    Line::from(vec![
        Span::styled(format!("{marker} {checkbox} "), base_style),
        Span::styled(code_facet_label(option.facet, language), base_style),
        Span::styled("  ".to_string(), subtle_style),
        Span::styled(option.value.clone(), base_style),
        Span::styled(
            match language {
                Language::Zh => format!("  {} 组", option.count),
                Language::En => format!("  {} snippets", option.count),
            },
            subtle_style,
        ),
    ])
}

fn code_facet_label(facet: CodePracticeFacet, language: Language) -> &'static str {
    match language {
        Language::Zh => match facet {
            CodePracticeFacet::Language => "语言",
            CodePracticeFacet::Framework => "框架",
            CodePracticeFacet::Project => "项目",
        },
        Language::En => match facet {
            CodePracticeFacet::Language => "language",
            CodePracticeFacet::Framework => "framework",
            CodePracticeFacet::Project => "project",
        },
    }
}

fn render_stats(frame: &mut Frame, area: Rect, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(3),
            Constraint::Min(8),
            Constraint::Length(3),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        None,
    );

    let records = app.all_records();
    frame.render_widget(
        Paragraph::new(stats_tab_lines(app)).block(
            Block::default()
                .borders(Borders::ALL)
                .title(text(app.language, "stats_tabs")),
        ),
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
    );

    let body = centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH);
    match app.stats_view {
        StatsView::Overview => {
            let max_lines = body.height.saturating_sub(2) as usize;
            frame.render_widget(
                Paragraph::new(stats_dashboard_lines(&records, max_lines, app.language)).block(
                    Block::default()
                        .borders(Borders::ALL)
                        .title(text(app.language, "stats_dashboard")),
                ),
                body,
            );
        }
        StatsView::Details => {
            let dates = stats_dates_from_records(&records);
            let detail_lines = if let Some(date) = dates.get(app.stats_day_index).copied() {
                let day_records = records_for_date(&records, date);
                let max_sessions = body.height.saturating_sub(9) as usize;
                stats_day_lines(
                    date,
                    app.stats_day_index,
                    dates.len(),
                    &day_records,
                    max_sessions,
                    app.language,
                )
            } else {
                vec![Line::from(text(app.language, "stats_empty"))]
            };
            frame.render_widget(
                Paragraph::new(detail_lines).block(
                    Block::default()
                        .borders(Borders::ALL)
                        .title(text(app.language, "stats_details")),
                ),
                body,
            );
        }
    }

    frame.render_widget(
        Paragraph::new(stats_help_text(app))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(text(app.language, "controls")),
            )
            .wrap(Wrap { trim: false }),
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
    );
}

fn stats_tab_lines(app: &App) -> Line<'static> {
    let active_style = Style::default()
        .fg(Color::Black)
        .bg(Color::Cyan)
        .add_modifier(Modifier::BOLD);
    let inactive_style = Style::default().fg(Color::Indexed(250));
    let (overview, details) = match app.language {
        Language::Zh => ("1 总览诊断", "2 每日明细"),
        Language::En => ("1 Overview", "2 Daily detail"),
    };
    Line::from(vec![
        Span::styled(
            format!(" {overview} "),
            if app.stats_view == StatsView::Overview {
                active_style
            } else {
                inactive_style
            },
        ),
        Span::raw("  "),
        Span::styled(
            format!(" {details} "),
            if app.stats_view == StatsView::Details {
                active_style
            } else {
                inactive_style
            },
        ),
        Span::raw(match app.language {
            Language::Zh => "   Tab 切换页面",
            Language::En => "   Tab switches page",
        }),
    ])
}

fn stats_help_text(app: &App) -> &'static str {
    match (app.language, app.stats_view) {
        (Language::Zh, StatsView::Overview) => {
            "1 总览 | 2 明细 | Tab 切换 | L 语言 | Esc 返回 | Q 退出"
        }
        (Language::Zh, StatsView::Details) => {
            "1 总览 | 2 明细 | ←/→ 日期 | Home/End 首尾 | L 语言 | Esc 返回 | Q 退出"
        }
        (Language::En, StatsView::Overview) => {
            "1 overview | 2 detail | Tab switch | L language | Esc menu | Q quit"
        }
        (Language::En, StatsView::Details) => {
            "1 overview | 2 detail | Left/Right date | Home/End ends | L language | Esc menu | Q quit"
        }
    }
}

fn render_running(frame: &mut Frame, area: Rect, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(3),
            Constraint::Min(8),
            Constraint::Length(4),
            Constraint::Length(3),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        app.target.as_ref(),
    );
    render_lesson_banner(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );
    render_target(
        frame,
        centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH),
        &app.target_chars,
        &app.input,
        app.language,
    );
    if app.exit_confirm {
        render_exit_confirmation(
            frame,
            centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
            app.language,
        );
    } else if app.is_paused() {
        render_pause(
            frame,
            centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
            app.language,
        );
    } else {
        render_metrics(
            frame,
            centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
            &app.target_chars,
            &app.input,
            &app.events,
            app.active_elapsed().unwrap_or_default(),
            app.language,
        );
    }
    render_progress(
        frame,
        centered_width(chunks[4], PRACTICE_PANEL_MAX_WIDTH),
        &app.target_chars,
        &app.input,
        app.language,
    );
}

fn render_complete(frame: &mut Frame, area: Rect, app: &App) {
    if app.completed_records.is_empty() {
        render_plan(frame, area, app);
        return;
    }

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Min(8),
            Constraint::Length(8),
            Constraint::Length(3),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        app.target.as_ref(),
    );
    render_target(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        &app.target_chars,
        &app.input,
        app.language,
    );

    let record = app.completed_records.last().expect("record exists");
    let slow = record
        .slow_tokens
        .iter()
        .take(6)
        .map(|stat| stat.token.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let next_text = if app.code_specialist_active {
        text(app.language, "next_code_group")
    } else if app.single_lesson.is_some() || app.lesson_index + 1 >= app.plan.lessons.len() {
        text(app.language, "finish_today")
    } else {
        text(app.language, "next_lesson")
    };
    let summary = vec![
        Line::from(vec![
            Span::styled(
                text(app.language, "session_complete"),
                Style::default()
                    .fg(Color::Green)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(format!("  {next_text}")),
        ]),
        Line::from(format!(
            "WPM {:.1} | {} {:.1} | {} {:.1}% | {} {} | {} {}",
            record.wpm,
            text(app.language, "raw_wpm"),
            record.raw_wpm,
            text(app.language, "accuracy"),
            record.accuracy,
            text(app.language, "errors"),
            record.error_count,
            text(app.language, "backspace"),
            record.backspace_count
        )),
        Line::from(format!("{}: {slow}", text(app.language, "slow_focus"))),
        Line::from(text(app.language, "complete_help")),
    ];
    frame.render_widget(
        Paragraph::new(summary)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(text(app.language, "result_title")),
            )
            .wrap(Wrap { trim: false }),
        centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH),
    );
    render_progress(
        frame,
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
        &app.target_chars,
        &app.input,
        app.language,
    );
}

fn render_summary(frame: &mut Frame, area: Rect, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Length(4),
            Constraint::Min(8),
            Constraint::Length(3),
        ])
        .split(area);

    render_header(
        frame,
        centered_width(chunks[0], PRACTICE_PANEL_MAX_WIDTH),
        app,
        None,
    );
    render_daily_progress(
        frame,
        centered_width(chunks[1], PRACTICE_PANEL_MAX_WIDTH),
        app,
    );

    let mut lines = Vec::new();
    for (index, record) in app.completed_records.iter().enumerate() {
        let lesson_index = app
            .completed_lesson_indices
            .get(index)
            .copied()
            .unwrap_or(index);
        let title = app
            .plan
            .lessons
            .get(lesson_index)
            .map(|lesson| lesson_title(lesson.kind, app.language))
            .unwrap_or(text(app.language, "lesson"));
        lines.push(Line::from(format!(
            "{}. {}  WPM {:.1} | {} {:.1}% | {} {}",
            index + 1,
            title,
            record.wpm,
            text(app.language, "accuracy"),
            record.accuracy,
            text(app.language, "errors"),
            record.error_count
        )));
    }
    if lines.is_empty() {
        lines.push(Line::from(text(app.language, "no_completed_lessons")));
    }

    frame.render_widget(
        Paragraph::new(lines)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(text(app.language, "today_summary")),
            )
            .wrap(Wrap { trim: false }),
        centered_width(chunks[2], PRACTICE_PANEL_MAX_WIDTH),
    );
    frame.render_widget(
        Paragraph::new(text(app.language, "summary_help")).block(
            Block::default()
                .borders(Borders::ALL)
                .title(text(app.language, "controls")),
        ),
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
    );
}

fn render_header(frame: &mut Frame, area: Rect, app: &App, target: Option<&PracticeTarget>) {
    let source = target
        .map(|target| target.source.as_str())
        .unwrap_or(text(app.language, "not_started"));
    let progress = match app.phase {
        Phase::Menu if app.menu_index == 0 => match app.language {
            Language::Zh => format!(
                "{} {} 组",
                text(app.language, "menu_mode_label"),
                app.plan.lessons.len()
            ),
            Language::En => format!(
                "{} {} lessons",
                text(app.language, "menu_mode_label"),
                app.plan.lessons.len()
            ),
        },
        Phase::Stats => text(app.language, "stats_title").to_string(),
        Phase::CodeSetup => text(app.language, "menu_code_specialist").to_string(),
        Phase::Menu if app.menu_index == app.code_specialist_menu_index() => {
            text(app.language, "menu_code_specialist").to_string()
        }
        Phase::Menu if app.menu_index == app.stats_menu_index() => {
            text(app.language, "stats_title").to_string()
        }
        Phase::Menu => format!(
            "{} {}/{}",
            text(app.language, "lesson_progress"),
            app.menu_index.min(app.plan.lessons.len()),
            app.plan.lessons.len()
        ),
        _ => format!(
            "{} {}/{}",
            text(app.language, "lesson_progress"),
            app.lesson_index.min(app.plan.lessons.len()) + 1,
            app.plan.lessons.len()
        ),
    };
    let title = Line::from(vec![
        Span::styled(
            "KeyLoop",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw("  "),
        Span::styled(progress, Style::default().fg(Color::Yellow)),
        Span::raw("  "),
        Span::styled(
            format!(
                "{}: {}",
                text(app.language, "source_label"),
                truncate(source, 48)
            ),
            Style::default().fg(Color::Gray),
        ),
    ]);
    let language_shortcut = if app.phase == Phase::Running {
        "Ctrl+L"
    } else {
        "L"
    };
    let mut help = vec![
        Span::styled("Esc", Style::default().fg(Color::Yellow)),
        Span::raw(format!(
            " {}  ",
            if app.phase == Phase::Running {
                running_help(app.language, app.is_paused(), app.exit_confirm)
            } else {
                text(app.language, "esc_help")
            }
        )),
        Span::styled(language_shortcut, Style::default().fg(Color::Yellow)),
        Span::raw(format!(" {}  ", text(app.language, "language_help"))),
        Span::styled(
            text(app.language, "ime_help"),
            Style::default().fg(Color::Gray),
        ),
    ];
    if app.ignored_non_ascii > 0 {
        help.push(Span::raw("  "));
        help.push(Span::styled(
            format!(
                "{}: {}",
                text(app.language, "ignored_non_ascii"),
                app.ignored_non_ascii
            ),
            Style::default().fg(Color::Red),
        ));
    }
    frame.render_widget(
        Paragraph::new(vec![title, Line::from(help)]).block(
            Block::default()
                .borders(Borders::ALL)
                .title(text(app.language, "status_title")),
        ),
        area,
    );
}

fn render_daily_progress(frame: &mut Frame, area: Rect, app: &App) {
    let completed_ms = app.completed_today_ms();
    let target_ms = u64::from(app.target_minutes()) * 60_000;
    let completed = format_practice_minutes(completed_ms);
    let target = app.target_minutes();
    let status = if completed_ms >= target_ms {
        let over = completed_ms.saturating_sub(target_ms);
        match app.language {
            Language::Zh => format!("已达成，超过 {} min", format_practice_minutes(over)),
            Language::En => format!("done, {} min over", format_practice_minutes(over)),
        }
    } else {
        let remaining = target_ms.saturating_sub(completed_ms);
        match app.language {
            Language::Zh => format!("还差 {} min", format_practice_minutes(remaining)),
            Language::En => format!("{} min remaining", format_practice_minutes(remaining)),
        }
    };
    let line = Line::from(vec![
        Span::styled(
            text(app.language, "daily_target"),
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw(format!("  {completed} / {target} min  |  ")),
        Span::styled(
            status,
            Style::default().fg(if completed_ms >= target_ms {
                Color::Green
            } else {
                Color::Yellow
            }),
        ),
    ]);

    frame.render_widget(
        Paragraph::new(vec![
            line,
            Line::from(text(app.language, "daily_goal_hint")),
        ])
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(text(app.language, "daily_progress")),
        )
        .wrap(Wrap { trim: false }),
        area,
    );
}

fn render_lesson_banner(frame: &mut Frame, area: Rect, app: &App) {
    let Some(lesson) = app.current_lesson() else {
        return;
    };
    let line = Line::from(vec![
        Span::styled(
            lesson_title(lesson.kind, app.language),
            Style::default()
                .fg(lesson_color(lesson.kind))
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw("  "),
        Span::styled(
            lesson_purpose(lesson.kind, app.language),
            Style::default().fg(Color::Gray),
        ),
    ]);
    frame.render_widget(
        Paragraph::new(vec![line]).block(
            Block::default()
                .borders(Borders::ALL)
                .title(text(app.language, "current_lesson")),
        ),
        area,
    );
}

fn render_target(
    frame: &mut Frame,
    area: Rect,
    target_chars: &[char],
    input: &[char],
    language: Language,
) {
    let inner_width = area.width.saturating_sub(4).max(1) as usize;
    let inner_height = area.height.saturating_sub(2).max(1);
    let wrapped = target_lines(target_chars, input, inner_width);
    let scroll = scroll_offset(wrapped.current_line, wrapped.lines.len(), inner_height);

    let paragraph = Paragraph::new(Text::from(wrapped.lines))
        .style(Style::default().fg(Color::White).bg(Color::Black))
        .scroll((scroll, 0))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::Gray))
                .style(Style::default().fg(Color::White).bg(Color::Black))
                .title(text(language, "ghost_title")),
        );
    frame.render_widget(paragraph, area);
}

fn render_metrics(
    frame: &mut Frame,
    area: Rect,
    target_chars: &[char],
    input: &[char],
    events: &[KeyEventRecord],
    elapsed: Duration,
    language: Language,
) {
    let metrics = live_metrics(target_chars, input, events, elapsed);
    let metric_line = Line::from(vec![
        Span::styled(
            format!("WPM {:.1}", metrics.wpm),
            Style::default()
                .fg(Color::Green)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw("  "),
        Span::styled(
            format!("{} {:.1}", text(language, "raw_wpm"), metrics.raw_wpm),
            Style::default().fg(Color::Gray),
        ),
        Span::raw("  "),
        Span::styled(
            format!("{} {:.1}%", text(language, "accuracy"), metrics.accuracy),
            Style::default().fg(if metrics.accuracy >= 95.0 {
                Color::Green
            } else {
                Color::Yellow
            }),
        ),
        Span::raw("  "),
        Span::styled(
            format!("{} {}", text(language, "errors"), metrics.errors),
            Style::default().fg(Color::Red),
        ),
        Span::raw("  "),
        Span::styled(
            format!("{} {}", text(language, "backspace"), metrics.backspaces),
            Style::default().fg(Color::Yellow),
        ),
    ]);
    frame.render_widget(
        Paragraph::new(vec![metric_line]).block(
            Block::default()
                .borders(Borders::ALL)
                .title(text(language, "metrics_title")),
        ),
        area,
    );
}

fn render_pause(frame: &mut Frame, area: Rect, language: Language) {
    let lines = match language {
        Language::Zh => vec![
            Line::from(vec![
                Span::styled(
                    "已暂停",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::raw("  计时已停止，当前输入会保留。"),
            ]),
            Line::from("Ctrl+P/Enter/Space 继续 | Esc 退出选项"),
        ],
        Language::En => vec![
            Line::from(vec![
                Span::styled(
                    "Paused",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::raw("  Timer is stopped and current input is kept."),
            ]),
            Line::from("Ctrl+P/Enter/Space resume | Esc exit options"),
        ],
    };

    frame.render_widget(
        Paragraph::new(lines)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(match language {
                        Language::Zh => "暂停",
                        Language::En => "Pause",
                    }),
            )
            .wrap(Wrap { trim: false }),
        area,
    );
}

fn render_exit_confirmation(frame: &mut Frame, area: Rect, language: Language) {
    let lines = match language {
        Language::Zh => vec![
            Line::from(vec![
                Span::styled(
                    "已暂停",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::raw("  你的输入还在，没有丢。"),
            ]),
            Line::from(
                "Enter/Space/Esc 继续 | S 保存当前进度并退出 | M 返回菜单不保存 | Q 退出不保存",
            ),
        ],
        Language::En => vec![
            Line::from(vec![
                Span::styled(
                    "Paused",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::raw("  Your current input is still here."),
            ]),
            Line::from(
                "Enter/Space/Esc resume | S save partial and exit | M menu without saving | Q quit without saving",
            ),
        ],
    };

    frame.render_widget(
        Paragraph::new(lines)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(match language {
                        Language::Zh => "退出确认",
                        Language::En => "Exit confirmation",
                    }),
            )
            .wrap(Wrap { trim: false }),
        area,
    );
}

fn render_progress(
    frame: &mut Frame,
    area: Rect,
    target_chars: &[char],
    input: &[char],
    language: Language,
) {
    let ratio = if target_chars.is_empty() {
        0.0
    } else {
        input.len() as f64 / target_chars.len() as f64
    }
    .clamp(0.0, 1.0);

    let label = format!("{}/{}", input.len(), target_chars.len());
    frame.render_widget(
        Gauge::default()
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(text(language, "progress_title")),
            )
            .gauge_style(Style::default().fg(Color::Cyan))
            .ratio(ratio)
            .label(label),
        area,
    );
}

fn running_help(language: Language, is_paused: bool, exit_confirm: bool) -> &'static str {
    match (language, is_paused, exit_confirm) {
        (Language::Zh, _, true) => "已暂停，按 Enter/Space/Esc 继续",
        (Language::En, _, true) => "paused, Enter/Space/Esc resumes",
        (Language::Zh, true, false) => "已暂停，Ctrl+P/Enter/Space 继续",
        (Language::En, true, false) => "paused, Ctrl+P/Enter/Space resumes",
        (Language::Zh, false, false) => "Ctrl+P 暂停 | Esc 退出选项",
        (Language::En, false, false) => "Ctrl+P pause | Esc exit options",
    }
}

fn push_char(ch: char, app: &mut App) {
    if app.input.len() >= app.target_chars.len() {
        return;
    }

    let position = app.input.len();
    let expected = app.target_chars.get(position).copied();
    let correct = expected == Some(ch);
    app.input.push(ch);
    app.events.push(KeyEventRecord {
        at_ms: app.active_elapsed_ms().unwrap_or(0),
        action: KeyAction::Insert,
        position,
        expected,
        input: Some(ch),
        correct,
    });
    if correct
        && ch == '\n'
        && matches!(
            app.target.as_ref().map(|target| target.mode),
            Some(Mode::Code)
        )
    {
        auto_insert_code_indent(app);
    }
}

fn auto_insert_code_indent(app: &mut App) {
    while app.input.len() < app.target_chars.len()
        && app.target_chars.get(app.input.len()) == Some(&' ')
    {
        let position = app.input.len();
        app.input.push(' ');
        app.events.push(KeyEventRecord {
            at_ms: app.active_elapsed_ms().unwrap_or(0),
            action: KeyAction::AutoIndent,
            position,
            expected: Some(' '),
            input: Some(' '),
            correct: true,
        });
    }
}

struct WrappedLines {
    lines: Vec<Line<'static>>,
    current_line: usize,
}

fn target_lines(target_chars: &[char], input: &[char], width: usize) -> WrappedLines {
    let mut lines = Vec::<Line>::new();
    let mut spans = Vec::<Span>::new();
    let mut col = 0usize;
    let mut current_line = 0usize;

    for (index, expected) in target_chars.iter().copied().enumerate() {
        if index == input.len() {
            current_line = lines.len();
        }

        if expected == '\n' {
            if !spans.is_empty() && col + 1 > width {
                push_line(&mut lines, &mut spans);
                if index == input.len() {
                    current_line = lines.len();
                }
            }
            let mut style = match input.get(index) {
                Some('\n') => correct_text_style(),
                Some(_) => wrong_text_style(),
                None => pending_text_style(),
            };
            if index == input.len() {
                style = style
                    .fg(Color::Black)
                    .bg(Color::Yellow)
                    .add_modifier(Modifier::BOLD);
            }
            spans.push(Span::styled("⏎", style));
            push_line(&mut lines, &mut spans);
            col = 0;
            continue;
        }

        let expected_width = display_width(expected);
        if !spans.is_empty() && col + expected_width > width {
            push_line(&mut lines, &mut spans);
            col = 0;
            if index == input.len() {
                current_line = lines.len();
            }
        }

        let mut style = match input.get(index) {
            Some(actual) if *actual == expected => correct_text_style(),
            Some(_) => wrong_text_style(),
            None => pending_text_style(),
        };
        if index == input.len() {
            style = style
                .fg(Color::Black)
                .bg(Color::Yellow)
                .add_modifier(Modifier::BOLD);
        }

        spans.push(Span::styled(display_char(expected), style));
        col += expected_width;
    }

    if input.len() >= target_chars.len() {
        current_line = lines.len();
    }
    if spans.is_empty() && lines.is_empty() {
        spans.push(Span::styled(" ", cursor_style()));
    }
    push_line(&mut lines, &mut spans);

    WrappedLines {
        lines,
        current_line,
    }
}

fn push_line(lines: &mut Vec<Line<'static>>, spans: &mut Vec<Span<'static>>) {
    lines.push(Line::from(std::mem::take(spans)));
}

fn scroll_offset(current_line: usize, total_lines: usize, view_height: u16) -> u16 {
    let view_height = view_height as usize;
    if total_lines <= view_height || view_height == 0 {
        return 0;
    }

    let half = view_height / 2;
    let max_scroll = total_lines.saturating_sub(view_height);
    current_line.saturating_sub(half).min(max_scroll) as u16
}

fn visible_window(active: usize, total: usize, height: usize) -> (usize, usize) {
    if total == 0 || height == 0 {
        return (0, 0);
    }
    let start = active
        .saturating_sub(height / 2)
        .min(total.saturating_sub(height));
    let end = (start + height).min(total);
    (start, end)
}

fn display_char(ch: char) -> String {
    match ch {
        '\t' => "  ".to_string(),
        other => other.to_string(),
    }
}

fn display_width(ch: char) -> usize {
    match ch {
        '\t' => 2,
        _ => 1,
    }
}

fn format_practice_minutes(ms: u64) -> String {
    let minutes = ms as f64 / 60_000.0;
    if (minutes - minutes.round()).abs() < 0.05 {
        format!("{minutes:.0}")
    } else {
        format!("{minutes:.1}")
    }
}

fn format_duration_short(ms: u64, language: Language) -> String {
    if ms < 60_000 {
        let seconds = if ms == 0 {
            0
        } else {
            ((ms + 500) / 1000).clamp(1, 59)
        };
        return match language {
            Language::Zh => format!("{seconds} 秒"),
            Language::En => format!("{seconds}s"),
        };
    }

    let total_minutes = (ms + 30_000) / 60_000;
    let hours = total_minutes / 60;
    let minutes = total_minutes % 60;
    match (language, hours, minutes) {
        (Language::Zh, 0, minutes) => format!("{minutes} 分钟"),
        (Language::Zh, hours, 0) => format!("{hours} 小时"),
        (Language::Zh, hours, minutes) => format!("{hours} 小时 {minutes} 分钟"),
        (Language::En, 0, minutes) => format!("{minutes}m"),
        (Language::En, hours, 0) => format!("{hours}h"),
        (Language::En, hours, minutes) => format!("{hours}h {minutes}m"),
    }
}

fn cursor_style() -> Style {
    Style::default()
        .fg(Color::Black)
        .bg(Color::Yellow)
        .add_modifier(Modifier::BOLD)
}

fn pending_text_style() -> Style {
    Style::default().fg(Color::Indexed(250)).bg(Color::Black)
}

fn correct_text_style() -> Style {
    Style::default().fg(Color::LightGreen).bg(Color::Black)
}

fn wrong_text_style() -> Style {
    Style::default()
        .fg(Color::LightRed)
        .bg(Color::Black)
        .add_modifier(Modifier::BOLD | Modifier::UNDERLINED)
}

struct LiveMetrics {
    wpm: f64,
    raw_wpm: f64,
    accuracy: f64,
    errors: u32,
    backspaces: u32,
}

fn live_metrics(
    target_chars: &[char],
    input: &[char],
    events: &[KeyEventRecord],
    elapsed: Duration,
) -> LiveMetrics {
    let final_correct = target_chars
        .iter()
        .zip(input.iter())
        .filter(|(expected, actual)| expected == actual)
        .count();
    let insert_count = events
        .iter()
        .filter(|event| matches!(event.action, KeyAction::Insert))
        .count();
    let correct_insert_count = events
        .iter()
        .filter(|event| matches!(event.action, KeyAction::Insert) && event.correct)
        .count();
    let has_auto_indent = events
        .iter()
        .any(|event| matches!(event.action, KeyAction::AutoIndent));
    let correct = if has_auto_indent {
        correct_insert_count
    } else {
        final_correct
    };
    let accuracy = if insert_count == 0 {
        100.0
    } else {
        correct_insert_count as f64 / insert_count as f64 * 100.0
    };
    let minutes = elapsed.as_millis().max(1) as f64 / 60_000.0;
    let raw_wpm = insert_count as f64 / 5.0 / minutes;
    let wpm = correct as f64 / 5.0 / minutes;
    let errors = events
        .iter()
        .filter(|event| matches!(event.action, KeyAction::Insert) && !event.correct)
        .count() as u32;
    let backspaces = events
        .iter()
        .filter(|event| matches!(event.action, KeyAction::Backspace))
        .count() as u32;

    LiveMetrics {
        wpm,
        raw_wpm,
        accuracy,
        errors,
        backspaces,
    }
}

fn duration_ms(duration: Duration) -> u64 {
    duration.as_millis().min(u128::from(u64::MAX)) as u64
}

fn truncate(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }

    let head = value
        .chars()
        .take(max_chars.saturating_sub(3))
        .collect::<String>();
    format!("{head}...")
}

fn centered_width(area: Rect, max_width: u16) -> Rect {
    let width = area.width.min(max_width);
    let left_padding = area.width.saturating_sub(width) / 2;
    Rect {
        x: area.x + left_padding,
        width,
        ..area
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn live_raw_wpm_counts_backspaced_inserts() {
        let events = vec![
            KeyEventRecord {
                at_ms: 100,
                action: KeyAction::Insert,
                position: 0,
                expected: Some('a'),
                input: Some('a'),
                correct: true,
            },
            KeyEventRecord {
                at_ms: 200,
                action: KeyAction::Insert,
                position: 1,
                expected: Some('b'),
                input: Some('x'),
                correct: false,
            },
            KeyEventRecord {
                at_ms: 300,
                action: KeyAction::Backspace,
                position: 1,
                expected: Some('b'),
                input: None,
                correct: false,
            },
            KeyEventRecord {
                at_ms: 400,
                action: KeyAction::Insert,
                position: 1,
                expected: Some('b'),
                input: Some('b'),
                correct: true,
            },
        ];

        let metrics = live_metrics(&['a', 'b'], &['a', 'b'], &events, Duration::from_secs(60));

        assert_eq!(metrics.raw_wpm, 0.6);
        assert!((metrics.accuracy - 100.0 * 2.0 / 3.0).abs() < 0.0001);
    }

    #[test]
    fn live_accuracy_keeps_errors_after_backspacing_to_empty() {
        let events = vec![
            KeyEventRecord {
                at_ms: 100,
                action: KeyAction::Insert,
                position: 0,
                expected: Some('a'),
                input: Some('x'),
                correct: false,
            },
            KeyEventRecord {
                at_ms: 200,
                action: KeyAction::Backspace,
                position: 0,
                expected: Some('a'),
                input: None,
                correct: false,
            },
        ];

        let metrics = live_metrics(&['a'], &[], &events, Duration::from_secs(60));

        assert_eq!(metrics.errors, 1);
        assert_eq!(metrics.accuracy, 0.0);
    }

    #[test]
    fn weighted_accuracy_uses_typed_len() {
        let short = SessionRecord {
            typed_len: 1,
            accuracy: 0.0,
            ..SessionRecord::default()
        };
        let long = SessionRecord {
            typed_len: 99,
            accuracy: 100.0,
            ..SessionRecord::default()
        };
        let records = vec![&short, &long];

        assert_eq!(weighted_accuracy(&records), 99.0);
    }

    #[test]
    fn weighted_accuracy_uses_effective_typed_len_for_legacy_records() {
        let legacy = SessionRecord {
            typed_len: 0,
            correct_chars: 3,
            user_input: "abc".to_string(),
            accuracy: 50.0,
            ..SessionRecord::default()
        };
        let modern = SessionRecord {
            typed_len: 1,
            accuracy: 100.0,
            ..SessionRecord::default()
        };
        let records = vec![&legacy, &modern];

        assert_eq!(weighted_accuracy(&records), 62.5);
    }

    #[test]
    fn aggregate_wpm_uses_total_chars_and_duration() {
        let short = SessionRecord {
            duration_ms: 60_000,
            correct_chars: 50,
            wpm: 10.0,
            ..SessionRecord::default()
        };
        let long = SessionRecord {
            duration_ms: 540_000,
            correct_chars: 450,
            wpm: 50.0,
            ..SessionRecord::default()
        };
        let records = vec![&short, &long];

        assert_eq!(aggregate_wpm(&records), 10.0);
    }

    #[test]
    fn running_key_ignores_non_ascii_without_recording_input() {
        let plan = DailyPracticePlan {
            target_minutes: 20,
            completed_ms: 0,
            lessons: Vec::new(),
        };
        let mut app = App::new(plan, Vec::new(), Language::Zh, Vec::new());
        app.started = Some(Instant::now());
        app.target_chars = vec!['a'];

        handle_running_key(&mut app, KeyCode::Char('你'), KeyModifiers::NONE);

        assert_eq!(app.ignored_non_ascii, 1);
        assert!(app.input.is_empty());
        assert!(app.events.is_empty());
    }

    #[test]
    fn running_esc_opens_confirmation_without_losing_input() {
        let mut app = running_app_with_input();

        handle_running_key(&mut app, KeyCode::Esc, KeyModifiers::NONE);

        assert_eq!(app.phase, Phase::Running);
        assert!(app.exit_confirm);
        assert!(app.is_paused());
        assert_eq!(app.input, vec!['a']);
        assert_eq!(app.events.len(), 1);
        assert!(!app.quit);
    }

    #[test]
    fn running_ctrl_p_pauses_and_resumes_without_losing_input() {
        let mut app = running_app_with_input();

        handle_running_key(&mut app, KeyCode::Char('p'), KeyModifiers::CONTROL);

        assert!(app.is_paused());
        assert!(!app.exit_confirm);
        assert_eq!(app.input, vec!['a']);

        handle_running_key(&mut app, KeyCode::Char('b'), KeyModifiers::NONE);

        assert_eq!(app.input, vec!['a']);
        assert_eq!(app.events.len(), 1);

        handle_running_key(&mut app, KeyCode::Char('p'), KeyModifiers::CONTROL);
        handle_running_key(&mut app, KeyCode::Char('b'), KeyModifiers::NONE);

        assert!(!app.is_paused());
        assert_eq!(app.input, vec!['a', 'b']);
        assert_eq!(app.events.len(), 2);
    }

    #[test]
    fn running_plain_p_is_typed_instead_of_pausing() {
        let mut app = running_app_with_input();

        handle_running_key(&mut app, KeyCode::Char('p'), KeyModifiers::NONE);

        assert!(!app.is_paused());
        assert_eq!(app.input, vec!['a', 'p']);
        assert_eq!(app.events.len(), 2);
        assert_eq!(app.events[1].input, Some('p'));
    }

    #[test]
    fn code_setup_toggles_multiple_filter_facets() {
        let mut app = empty_app_with_code_options(vec![
            code_option(CodePracticeFacet::Language, "typescript", 120),
            code_option(CodePracticeFacet::Framework, "nestjs", 30),
            code_option(CodePracticeFacet::Language, "solidity", 120),
        ]);
        app.phase = Phase::CodeSetup;

        handle_code_setup_key(&mut app, KeyCode::Char(' '));
        handle_code_setup_key(&mut app, KeyCode::Down);
        handle_code_setup_key(&mut app, KeyCode::Char(' '));

        let config = app.selected_code_config();
        assert!(config.match_any);
        assert_eq!(config.languages, vec!["typescript"]);
        assert_eq!(config.frameworks, vec!["nestjs"]);
    }

    #[test]
    fn menu_code_specialist_opens_setup_before_stats() {
        let mut app = empty_app_with_code_options(vec![code_option(
            CodePracticeFacet::Language,
            "typescript",
            120,
        )]);
        app.menu_index = app.code_specialist_menu_index();

        handle_menu_key(&mut app, KeyCode::Enter);

        assert_eq!(app.phase, Phase::CodeSetup);
    }

    #[test]
    fn code_enter_auto_inserts_expected_indentation() {
        let mut app = empty_app_with_code_options(Vec::new());
        app.phase = Phase::Running;
        app.target = Some(PracticeTarget {
            mode: Mode::Code,
            text: "\n  x".to_string(),
            source: "test".to_string(),
        });
        app.target_chars = vec!['\n', ' ', ' ', 'x'];
        app.started_at = Some(Utc::now());
        app.started = Some(Instant::now());

        handle_running_key(&mut app, KeyCode::Enter, KeyModifiers::NONE);

        assert_eq!(app.input, vec!['\n', ' ', ' ']);
        assert!(matches!(app.events[0].action, KeyAction::Insert));
        assert!(matches!(app.events[1].action, KeyAction::AutoIndent));
        assert!(matches!(app.events[2].action, KeyAction::AutoIndent));
        let record = app
            .current_record()
            .expect("partial code record should build");
        assert_eq!(record.typed_len, 1);
        assert_eq!(record.correct_chars, 1);
    }

    #[test]
    fn running_exit_confirmation_esc_resumes_practice() {
        let mut app = running_app_with_input();
        handle_running_key(&mut app, KeyCode::Esc, KeyModifiers::NONE);

        assert!(app.is_paused());

        handle_running_key(&mut app, KeyCode::Esc, KeyModifiers::NONE);

        assert_eq!(app.phase, Phase::Running);
        assert!(!app.exit_confirm);
        assert!(!app.is_paused());
        assert_eq!(app.input, vec!['a']);
        assert!(!app.quit);
    }

    #[test]
    fn running_exit_confirmation_can_save_partial_record() {
        let mut app = running_app_with_input();
        handle_running_key(&mut app, KeyCode::Esc, KeyModifiers::NONE);

        handle_running_key(&mut app, KeyCode::Char('s'), KeyModifiers::NONE);

        assert!(app.quit);
        assert_eq!(app.completed_records.len(), 1);
        assert!(app.completed_lesson_indices.is_empty());
        let record = &app.completed_records[0];
        assert_eq!(record.user_input, "a");
        assert_eq!(record.target_len, 3);
        assert_eq!(record.typed_len, 1);
    }

    #[test]
    fn active_elapsed_excludes_accumulated_and_current_pause_time() {
        let mut app = running_app_with_input();
        app.started = Some(Instant::now() - Duration::from_secs(60));
        app.paused_total = Duration::from_secs(45);
        app.paused_at = Some(Instant::now() - Duration::from_secs(10));

        let active = app
            .active_elapsed()
            .expect("running app should have elapsed time");

        assert!(active >= Duration::from_secs(5));
        assert!(active < Duration::from_secs(7));
    }

    #[test]
    fn running_event_timestamps_use_active_elapsed() {
        let mut app = running_app_with_input();
        app.started = Some(Instant::now() - Duration::from_secs(60));
        app.paused_total = Duration::from_secs(55);

        handle_running_key(&mut app, KeyCode::Char('b'), KeyModifiers::NONE);

        let event = app
            .events
            .last()
            .expect("typed character should be recorded");
        assert!(event.at_ms >= 5_000);
        assert!(event.at_ms < 7_000);
    }

    #[test]
    fn running_exit_confirmation_menu_is_explicit_discard() {
        let mut app = running_app_with_input();
        handle_running_key(&mut app, KeyCode::Esc, KeyModifiers::NONE);

        handle_running_key(&mut app, KeyCode::Char('m'), KeyModifiers::NONE);

        assert_eq!(app.phase, Phase::Menu);
        assert!(!app.exit_confirm);
        assert!(app.input.is_empty());
        assert!(app.completed_records.is_empty());
    }

    #[test]
    fn menu_zero_key_does_not_select_first_item() {
        let plan = DailyPracticePlan {
            target_minutes: 20,
            completed_ms: 0,
            lessons: Vec::new(),
        };
        let mut app = App::new(plan, Vec::new(), Language::Zh, Vec::new());
        app.menu_index = app.stats_menu_index();

        handle_menu_key(&mut app, KeyCode::Char('0'));

        assert_eq!(app.menu_index, app.stats_menu_index());
    }

    #[test]
    fn target_lines_marks_wrong_newline_input() {
        let wrapped = target_lines(&['a', '\n', 'b'], &['a', 'x'], 16);

        assert_eq!(wrapped.lines.len(), 2);
        assert_eq!(wrapped.lines[0].spans.len(), 2);
        assert_eq!(wrapped.lines[0].spans[1].content.as_ref(), "⏎");
        assert_eq!(wrapped.lines[0].spans[1].style, wrong_text_style());
    }

    #[test]
    fn target_lines_wraps_newline_marker_at_width_boundary() {
        let wrapped = target_lines(&['a', '\n', 'b'], &[], 1);

        assert_eq!(wrapped.lines[0].spans[0].content.as_ref(), "a");
        assert_eq!(wrapped.lines[1].spans[0].content.as_ref(), "⏎");
        assert_eq!(wrapped.lines[2].spans[0].content.as_ref(), "b");
    }

    #[test]
    fn target_lines_wraps_wide_tab_before_overflow() {
        let wrapped = target_lines(&['a', '\t', 'b'], &[], 2);

        assert_eq!(wrapped.lines[0].spans[0].content.as_ref(), "a");
        assert_eq!(wrapped.lines[1].spans[0].content.as_ref(), "  ");
        assert_eq!(wrapped.lines[2].spans[0].content.as_ref(), "b");
    }

    #[test]
    fn terminal_small_guard_matches_running_layout_height() {
        assert!(terminal_too_small(Rect::new(0, 0, 80, 24)));
        assert!(!terminal_too_small(Rect::new(0, 0, 80, 25)));
        assert!(terminal_too_small(Rect::new(0, 0, 71, 30)));
        assert!(!terminal_too_small(Rect::new(0, 0, 72, 30)));
    }

    #[test]
    fn short_duration_keeps_seconds_under_one_minute() {
        assert_eq!(format_duration_short(0, Language::Zh), "0 秒");
        assert_eq!(format_duration_short(29_000, Language::Zh), "29 秒");
        assert_eq!(format_duration_short(29_000, Language::En), "29s");
        assert_eq!(format_duration_short(59_500, Language::Zh), "59 秒");
        assert_eq!(format_duration_short(59_500, Language::En), "59s");
        assert_eq!(format_duration_short(60_000, Language::Zh), "1 分钟");
    }

    #[test]
    fn record_error_rate_ignores_empty_legacy_targets() {
        let empty = SessionRecord::default();
        let valid = SessionRecord {
            target_len: 100,
            error_count: 5,
            ..SessionRecord::default()
        };

        assert_eq!(record_error_rate(&empty), None);
        assert_eq!(record_error_rate(&valid), Some(5.0));
    }

    #[test]
    fn top_problem_tokens_uses_legacy_error_tokens() {
        let mut record = SessionRecord::default();
        record.error_tokens.insert("response".to_string(), 3);

        let records = vec![&record];
        let tokens = top_problem_tokens(&records, true, 1);

        assert_eq!(tokens[0].token, "response");
        assert_eq!(tokens[0].errors, 3);
    }

    #[test]
    fn aggregate_key_errors_merges_new_and_legacy_records() {
        let new_record = SessionRecord {
            key_events: vec![KeyEventRecord {
                at_ms: 10,
                action: KeyAction::Insert,
                position: 0,
                expected: Some('a'),
                input: Some('x'),
                correct: false,
            }],
            ..SessionRecord::default()
        };
        let mut legacy_record = SessionRecord::default();
        legacy_record.error_chars.insert("b".to_string(), 2);

        let records = vec![&new_record, &legacy_record];
        let counts = aggregate_key_errors(&records);

        assert_eq!(counts.get("a"), Some(&1));
        assert_eq!(counts.get("b"), Some(&2));
    }

    fn running_app_with_input() -> App {
        let mut app = empty_app_with_code_options(Vec::new());
        app.phase = Phase::Running;
        app.target = Some(PracticeTarget {
            mode: Mode::Words,
            text: "abc".to_string(),
            source: "test".to_string(),
        });
        app.target_chars = vec!['a', 'b', 'c'];
        app.started_at = Some(Utc::now());
        app.started = Some(Instant::now());
        handle_running_key(&mut app, KeyCode::Char('a'), KeyModifiers::NONE);
        app
    }

    fn empty_app_with_code_options(code_options: Vec<CodePracticeOption>) -> App {
        let plan = DailyPracticePlan {
            target_minutes: 20,
            completed_ms: 0,
            lessons: Vec::new(),
        };
        App::new(plan, Vec::new(), Language::Zh, code_options)
    }

    fn code_option(facet: CodePracticeFacet, value: &str, count: usize) -> CodePracticeOption {
        CodePracticeOption {
            facet,
            value: value.to_string(),
            count,
        }
    }
}
