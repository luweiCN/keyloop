use crate::metrics;
use crate::model::{
    DailyPracticePlan, KeyAction, KeyEventRecord, Language, LessonKind, PracticeLesson,
    PracticeTarget, SessionRecord,
};
use anyhow::Result;
use chrono::{DateTime, Local, NaiveDate, Utc};
use crossterm::cursor::Show;
use crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};
use crossterm::execute;
use crossterm::terminal::{self, EnterAlternateScreen, LeaveAlternateScreen};
use ratatui::backend::CrosstermBackend;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, Borders, Gauge, Paragraph, Wrap};
use ratatui::{Frame, Terminal};
use std::collections::BTreeMap;
use std::io::{self, Stdout};
use std::time::{Duration, Instant};

const PRACTICE_PANEL_MAX_WIDTH: u16 = 92;
const MIN_TERMINAL_WIDTH: u16 = 72;
const MIN_TERMINAL_HEIGHT: u16 = 25;

struct Tui {
    terminal: Terminal<CrosstermBackend<Stdout>>,
}

impl Tui {
    fn enter() -> Result<Self> {
        terminal::enable_raw_mode()?;
        let mut stdout = io::stdout();
        if let Err(error) = execute!(stdout, EnterAlternateScreen) {
            let _ = terminal::disable_raw_mode();
            return Err(error.into());
        }
        let backend = CrosstermBackend::new(stdout);
        let terminal = match Terminal::new(backend) {
            Ok(terminal) => terminal,
            Err(error) => {
                restore_terminal();
                return Err(error.into());
            }
        };
        let mut tui = Self { terminal };
        tui.terminal.clear()?;
        Ok(tui)
    }
}

impl Drop for Tui {
    fn drop(&mut self) {
        let _ = terminal::disable_raw_mode();
        let _ = execute!(self.terminal.backend_mut(), Show, LeaveAlternateScreen);
        let _ = self.terminal.show_cursor();
    }
}

fn restore_terminal() {
    let _ = terminal::disable_raw_mode();
    let mut stdout = io::stdout();
    let _ = execute!(stdout, Show, LeaveAlternateScreen);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Menu,
    Plan,
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
    single_lesson: Option<usize>,
    lesson_index: usize,
    target: Option<PracticeTarget>,
    target_chars: Vec<char>,
    input: Vec<char>,
    events: Vec<KeyEventRecord>,
    started_at: Option<DateTime<Utc>>,
    started: Option<Instant>,
    completed_records: Vec<SessionRecord>,
    completed_lesson_indices: Vec<usize>,
    ignored_non_ascii: u32,
    quit: bool,
}

impl App {
    fn new(plan: DailyPracticePlan, records: Vec<SessionRecord>, language: Language) -> Self {
        Self {
            phase: Phase::Menu,
            language,
            plan,
            records,
            menu_index: 0,
            stats_view: StatsView::Overview,
            stats_day_index: 0,
            single_lesson: None,
            lesson_index: 0,
            target: None,
            target_chars: Vec::new(),
            input: Vec::new(),
            events: Vec::new(),
            started_at: None,
            started: None,
            completed_records: Vec::new(),
            completed_lesson_indices: Vec::new(),
            ignored_non_ascii: 0,
            quit: false,
        }
    }

    fn current_lesson(&self) -> Option<&PracticeLesson> {
        self.plan.lessons.get(self.lesson_index)
    }

    fn menu_len(&self) -> usize {
        self.plan.lessons.len() + 2
    }

    fn stats_menu_index(&self) -> usize {
        self.plan.lessons.len() + 1
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
        self.target_chars = target.text.chars().collect();
        self.target = Some(target);
        self.input.clear();
        self.events.clear();
        self.ignored_non_ascii = 0;
        self.started_at = Some(Utc::now());
        self.started = Some(Instant::now());
        self.phase = Phase::Running;
    }

    fn repeat_current(&mut self) {
        self.begin_current();
    }

    fn begin_next(&mut self) {
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

    fn complete(&mut self) {
        let Some(target) = self.target.clone() else {
            return;
        };
        let Some(started_at) = self.started_at else {
            return;
        };
        let Some(started) = self.started else {
            return;
        };

        let duration_ms = elapsed_ms(started);
        let user_input = self.input.iter().collect::<String>();
        let record = metrics::build_session_record(
            target,
            started_at,
            duration_ms,
            user_input,
            self.events.clone(),
        );
        self.completed_records.push(record);
        self.completed_lesson_indices.push(self.lesson_index);
        self.phase = Phase::Complete;
    }

    fn reset_to_menu(&mut self) {
        self.phase = Phase::Menu;
        self.single_lesson = None;
        self.lesson_index = 0;
        self.target = None;
        self.target_chars.clear();
        self.input.clear();
        self.events.clear();
        self.started_at = None;
        self.started = None;
        self.ignored_non_ascii = 0;
    }

    fn choose_menu_item(&mut self) {
        if self.menu_index == 0 {
            self.single_lesson = None;
            self.lesson_index = 0;
            self.phase = Phase::Plan;
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
    let mut app = App::new(plan, records, language);

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
        KeyCode::Left | KeyCode::Char('h') | KeyCode::Char('H') | KeyCode::Char('[') => {
            if app.stats_view == StatsView::Details && dates_len > 0 {
                app.stats_day_index = (app.stats_day_index + 1).min(dates_len - 1);
            }
        }
        KeyCode::Right | KeyCode::Char('j') | KeyCode::Char('J') | KeyCode::Char(']') => {
            if app.stats_view == StatsView::Details {
                app.stats_day_index = app.stats_day_index.saturating_sub(1);
            }
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
    let Some(started) = app.started else {
        return;
    };

    if code == KeyCode::Esc {
        app.reset_to_menu();
        return;
    }

    match code {
        KeyCode::Backspace => {
            if !app.input.is_empty() {
                app.input.pop();
                let position = app.input.len();
                app.events.push(KeyEventRecord {
                    at_ms: elapsed_ms(started),
                    action: KeyAction::Backspace,
                    position,
                    expected: app.target_chars.get(position).copied(),
                    input: None,
                    correct: false,
                });
            }
        }
        KeyCode::Enter => push_char('\n', app, started),
        KeyCode::Tab => push_char('\t', app, started),
        KeyCode::Char(ch) => {
            if modifiers.contains(KeyModifiers::CONTROL) || modifiers.contains(KeyModifiers::ALT) {
                return;
            }
            if !ch.is_ascii() {
                app.ignored_non_ascii += 1;
                return;
            }
            push_char(ch, app, started);
        }
        _ => {}
    }
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
            Constraint::Length(3),
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
    render_metrics(
        frame,
        centered_width(chunks[3], PRACTICE_PANEL_MAX_WIDTH),
        &app.target_chars,
        &app.input,
        &app.events,
        app.started,
        app.language,
    );
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
    let next_text = if app.single_lesson.is_some() || app.lesson_index + 1 >= app.plan.lessons.len()
    {
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
        Span::raw(format!(" {}  ", text(app.language, "esc_help"))),
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
    started: Option<Instant>,
    language: Language,
) {
    let elapsed = started.map(|started| started.elapsed()).unwrap_or_default();
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

fn push_char(ch: char, app: &mut App, started: Instant) {
    if app.input.len() >= app.target_chars.len() {
        return;
    }

    let position = app.input.len();
    let expected = app.target_chars.get(position).copied();
    let correct = expected == Some(ch);
    app.input.push(ch);
    app.events.push(KeyEventRecord {
        at_ms: elapsed_ms(started),
        action: KeyAction::Insert,
        position,
        expected,
        input: Some(ch),
        correct,
    });
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
            spans.push(Span::styled("↵", style));
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
    let correct = target_chars
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

fn elapsed_ms(started: Instant) -> u64 {
    started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64
}

fn stats_overview_lines(records: &[&SessionRecord], language: Language) -> Vec<Line<'static>> {
    if records.is_empty() {
        return vec![Line::from(text(language, "stats_empty"))];
    }

    let total_ms = records.iter().map(|record| record.duration_ms).sum::<u64>();
    let dates = stats_dates_from_records(records);
    let best_wpm = records
        .iter()
        .map(|record| record.wpm)
        .fold(0.0_f64, f64::max);
    let avg_wpm = aggregate_wpm(records);
    let avg_accuracy = weighted_accuracy(records);
    let lowest_error_rate = records
        .iter()
        .filter_map(|record| record_error_rate(record))
        .fold(f64::INFINITY, f64::min);
    let lowest_error_rate = if lowest_error_rate.is_finite() {
        lowest_error_rate
    } else {
        0.0
    };
    let total_errors = records.iter().map(|record| record.error_count).sum::<u32>();
    let total_backspaces = records
        .iter()
        .map(|record| record.backspace_count)
        .sum::<u32>();
    let worst_word = top_problem_tokens(records, true, 1)
        .first()
        .map(|entry| format!("{}({})", entry.token, entry.errors))
        .unwrap_or_else(|| text(language, "stats_none").to_string());
    let worst_key = top_key_errors(records, 1)
        .first()
        .map(|entry| format!("{}({})", entry.label, entry.count))
        .unwrap_or_else(|| text(language, "stats_none").to_string());

    match language {
        Language::Zh => vec![
            Line::from(format!(
                "总览  {} 次 | {} 天 | 总时长 {}",
                records.len(),
                dates.len(),
                format_duration_short(total_ms, language)
            )),
            Line::from(format!(
                "速度  历史最高 WPM {best_wpm:.1} | 平均 WPM {avg_wpm:.1}"
            )),
            Line::from(format!(
                "质量  平均正确率 {avg_accuracy:.1}% | 最低错误率 {lowest_error_rate:.1}%"
            )),
            Line::from(format!(
                "错误  总错误 {} | 总退格 {} | {}",
                total_errors,
                total_backspaces,
                recent_activity_text(records, language)
            )),
            Line::from(vec![
                Span::styled("弱项  ", Style::default().fg(Color::LightRed)),
                Span::raw(format!("高错词 {worst_word} | 高错键 {worst_key}")),
            ]),
        ],
        Language::En => vec![
            Line::from(format!(
                "Overview  {} sessions | {} days | total {}",
                records.len(),
                dates.len(),
                format_duration_short(total_ms, language)
            )),
            Line::from(format!(
                "Speed  best WPM {best_wpm:.1} | average WPM {avg_wpm:.1}"
            )),
            Line::from(format!(
                "Quality  average accuracy {avg_accuracy:.1}% | lowest error rate {lowest_error_rate:.1}%"
            )),
            Line::from(format!(
                "Errors  total {} | backspace {} | {}",
                total_errors,
                total_backspaces,
                recent_activity_text(records, language)
            )),
            Line::from(vec![
                Span::styled("Focus  ", Style::default().fg(Color::LightRed)),
                Span::raw(format!("word {worst_word} | key {worst_key}")),
            ]),
        ],
    }
}

fn stats_dashboard_lines(
    records: &[&SessionRecord],
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    if records.is_empty() {
        return vec![Line::from(text(language, "stats_empty"))];
    }
    if max_lines <= 12 {
        return compact_stats_dashboard_lines(records, max_lines, language);
    }

    let mut lines = Vec::new();
    for line in stats_overview_lines(records, language) {
        push_stats_line(&mut lines, max_lines, line);
    }
    push_stats_line(&mut lines, max_lines, Line::from(""));

    let remaining = max_lines.saturating_sub(lines.len());
    for line in stats_diagnosis_lines(records, remaining, language) {
        push_stats_line(&mut lines, max_lines, line);
    }

    lines
}

fn compact_stats_dashboard_lines(
    records: &[&SessionRecord],
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    let total_ms = records.iter().map(|record| record.duration_ms).sum::<u64>();
    let dates = stats_dates_from_records(records);
    let best_wpm = records
        .iter()
        .map(|record| record.wpm)
        .fold(0.0_f64, f64::max);
    let avg_wpm = aggregate_wpm(records);
    let avg_accuracy = weighted_accuracy(records);
    let total_errors = records.iter().map(|record| record.error_count).sum::<u32>();
    let total_backspaces = records
        .iter()
        .map(|record| record.backspace_count)
        .sum::<u32>();
    let worst_word = top_problem_tokens(records, true, 1)
        .first()
        .map(|entry| format!("{}({})", truncate(&entry.token, 12), entry.errors))
        .unwrap_or_else(|| text(language, "stats_none").to_string());

    let mut lines = Vec::new();
    match language {
        Language::Zh => {
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!(
                    "总览  {} 次 | {} 天 | 总时长 {}",
                    records.len(),
                    dates.len(),
                    format_duration_short(total_ms, language)
                )),
            );
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!(
                    "速度  最高 WPM {best_wpm:.1} | 平均 {avg_wpm:.1} | 正确率 {avg_accuracy:.1}%"
                )),
            );
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!(
                    "错误  总错误 {total_errors} | 退格 {total_backspaces} | 高错词 {worst_word}"
                )),
            );
        }
        Language::En => {
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!(
                    "Overview  {} sessions | {} days | total {}",
                    records.len(),
                    dates.len(),
                    format_duration_short(total_ms, language)
                )),
            );
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!(
                    "Speed  best WPM {best_wpm:.1} | avg {avg_wpm:.1} | accuracy {avg_accuracy:.1}%"
                )),
            );
            push_stats_line(
                &mut lines,
                max_lines,
                Line::from(format!(
                    "Errors  total {total_errors} | backspace {total_backspaces} | worst word {worst_word}"
                )),
            );
        }
    }

    push_stats_line(&mut lines, max_lines, Line::from(""));
    push_stats_line(&mut lines, max_lines, heatmap_legend_line(language, true));
    let key_counts = aggregate_key_errors(records);
    for line in compact_keyboard_heatmap_lines(&key_counts) {
        push_stats_line(&mut lines, max_lines, line);
    }
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            match language {
                Language::Zh => "符号",
                Language::En => "Symbols",
            },
            Color::Yellow,
            compact_problem_text(top_problem_tokens(records, false, 3), language),
        ),
    );
    lines
}

#[derive(Debug, Clone)]
struct ProblemToken {
    token: String,
    errors: u32,
    count: u32,
    score: u64,
}

#[derive(Debug, Clone)]
struct KeyProblem {
    label: String,
    count: u32,
}

#[derive(Default)]
struct ProblemTokenAggregate {
    errors: u32,
    count: u32,
    score: u64,
}

fn stats_diagnosis_lines(
    records: &[&SessionRecord],
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    if records.is_empty() {
        return vec![Line::from(text(language, "stats_empty"))];
    }
    if max_lines <= 8 {
        return compact_stats_diagnosis_lines(records, max_lines, language);
    }

    let mut lines = Vec::new();
    push_stats_line(
        &mut lines,
        max_lines,
        Line::from(vec![
            Span::styled(
                text(language, "stats_radar"),
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(match language {
                Language::Zh => "  全部历史",
                Language::En => "  all history",
            }),
        ]),
    );

    append_problem_bars(
        &mut lines,
        max_lines,
        text(language, "stats_error_words"),
        top_problem_tokens(records, true, 4),
        language,
    );
    append_problem_bars(
        &mut lines,
        max_lines,
        text(language, "stats_error_symbols"),
        top_problem_tokens(records, false, 3),
        language,
    );

    let key_counts = aggregate_key_errors(records);
    push_stats_line(
        &mut lines,
        max_lines,
        Line::from(vec![Span::styled(
            text(language, "stats_key_heat"),
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        )]),
    );
    push_stats_line(&mut lines, max_lines, heatmap_legend_line(language, false));
    for line in keyboard_heatmap_lines(&key_counts) {
        push_stats_line(&mut lines, max_lines, line);
    }

    append_slow_bars(
        &mut lines,
        max_lines,
        text(language, "stats_slow_tokens"),
        top_slow_tokens(records, 3),
        language,
    );

    if lines.is_empty() {
        vec![Line::from(text(language, "stats_empty"))]
    } else {
        lines
    }
}

fn compact_stats_diagnosis_lines(
    records: &[&SessionRecord],
    max_lines: usize,
    language: Language,
) -> Vec<Line<'static>> {
    let (word_title, symbol_title, key_title, slow_title) = match language {
        Language::Zh => ("错词", "符号", "键位", "慢项"),
        Language::En => ("Words", "Symbols", "Keys", "Slow"),
    };
    let mut lines = Vec::new();
    push_stats_line(
        &mut lines,
        max_lines,
        Line::from(vec![
            Span::styled(
                text(language, "stats_radar"),
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(match language {
                Language::Zh => "  压缩视图",
                Language::En => "  compact view",
            }),
        ]),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            word_title,
            Color::LightRed,
            compact_problem_text(top_problem_tokens(records, true, 2), language),
        ),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            symbol_title,
            Color::Yellow,
            compact_problem_text(top_problem_tokens(records, false, 3), language),
        ),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            key_title,
            Color::LightGreen,
            compact_key_text(top_key_errors(records, 3), language),
        ),
    );
    push_stats_line(
        &mut lines,
        max_lines,
        compact_diagnosis_line(
            slow_title,
            Color::LightBlue,
            compact_slow_text(top_slow_tokens(records, 2), language),
        ),
    );
    lines
}

fn compact_diagnosis_line(title: &'static str, color: Color, value: String) -> Line<'static> {
    Line::from(vec![
        Span::styled(format!("{title:<6} "), Style::default().fg(color)),
        Span::raw(value),
    ])
}

fn stats_day_lines(
    date: NaiveDate,
    index: usize,
    total_dates: usize,
    records: &[&SessionRecord],
    max_sessions: usize,
    language: Language,
) -> Vec<Line<'static>> {
    if records.is_empty() {
        return vec![Line::from(text(language, "stats_empty_day"))];
    }

    let total_ms = records.iter().map(|record| record.duration_ms).sum::<u64>();
    let best_wpm = records
        .iter()
        .map(|record| record.wpm)
        .fold(0.0_f64, f64::max);
    let avg_wpm = aggregate_wpm(records);
    let avg_accuracy = weighted_accuracy(records);
    let error_count = records.iter().map(|record| record.error_count).sum::<u32>();
    let backspace_count = records
        .iter()
        .map(|record| record.backspace_count)
        .sum::<u32>();
    let minutes = total_ms as f64 / 60_000.0;
    let bar = minute_bar(minutes, 20.0, 18);
    let day_words = compact_problem_text(top_problem_tokens(records, true, 2), language);
    let day_keys = compact_key_text(top_key_errors(records, 4), language);

    if max_sessions == 0 {
        return match language {
            Language::Zh => vec![
                Line::from(format!("日期 {date} ({}/{})", index + 1, total_dates)),
                Line::from(format!(
                    "{} 次 | {} | {} / 20 min",
                    records.len(),
                    format_duration_short(total_ms, language),
                    format_practice_minutes(total_ms)
                )),
                Line::from(format!("WPM 最高 {best_wpm:.1} | 平均 {avg_wpm:.1}")),
                Line::from(format!(
                    "正确率 {avg_accuracy:.1}% | 错 {error_count} | 退 {backspace_count}"
                )),
                Line::from(vec![
                    Span::styled("错词  ", Style::default().fg(Color::LightRed)),
                    Span::raw(day_words),
                ]),
                Line::from(vec![
                    Span::styled("键位  ", Style::default().fg(Color::Yellow)),
                    Span::raw(day_keys),
                ]),
            ],
            Language::En => vec![
                Line::from(format!("Date {date} ({}/{})", index + 1, total_dates)),
                Line::from(format!(
                    "{} sessions | {} | {} / 20 min",
                    records.len(),
                    format_duration_short(total_ms, language),
                    format_practice_minutes(total_ms)
                )),
                Line::from(format!("WPM best {best_wpm:.1} | avg {avg_wpm:.1}")),
                Line::from(format!(
                    "Acc {avg_accuracy:.1}% | err {error_count} | back {backspace_count}"
                )),
                Line::from(vec![
                    Span::styled("Words  ", Style::default().fg(Color::LightRed)),
                    Span::raw(day_words),
                ]),
                Line::from(vec![
                    Span::styled("Keys  ", Style::default().fg(Color::Yellow)),
                    Span::raw(day_keys),
                ]),
            ],
        };
    }

    let mut lines = match language {
        Language::Zh => vec![
            Line::from(format!(
                "日期 {}  ({}/{})  ←/→ 切换日期",
                date,
                index + 1,
                total_dates
            )),
            Line::from(format!(
                "当天 {} 次 | {} | 最高 WPM {best_wpm:.1} | 平均 WPM {avg_wpm:.1} | 正确率 {avg_accuracy:.1}%",
                records.len(),
                format_duration_short(total_ms, language)
            )),
            Line::from(format!(
                "进度 [{bar}] {minutes:.1} / 20 min | 错误 {error_count} | 退格 {backspace_count}"
            )),
            Line::from(vec![
                Span::styled("当天错词  ", Style::default().fg(Color::LightRed)),
                Span::raw(day_words),
            ]),
            Line::from(vec![
                Span::styled("当天键位  ", Style::default().fg(Color::Yellow)),
                Span::raw(day_keys),
            ]),
        ],
        Language::En => vec![
            Line::from(format!(
                "Date {}  ({}/{})  Left/Right switches date",
                date,
                index + 1,
                total_dates
            )),
            Line::from(format!(
                "Day {} sessions | {} | best WPM {best_wpm:.1} | avg WPM {avg_wpm:.1} | accuracy {avg_accuracy:.1}%",
                records.len(),
                format_duration_short(total_ms, language)
            )),
            Line::from(format!(
                "Target [{bar}] {minutes:.1} / 20 min | errors {error_count} | backspace {backspace_count}"
            )),
            Line::from(vec![
                Span::styled("Day words  ", Style::default().fg(Color::LightRed)),
                Span::raw(day_words),
            ]),
            Line::from(vec![
                Span::styled("Day keys  ", Style::default().fg(Color::Yellow)),
                Span::raw(day_keys),
            ]),
        ],
    };

    lines.push(Line::from(""));

    for (session_index, record) in records.iter().take(max_sessions).enumerate() {
        lines.push(session_line(session_index, record, language));
    }
    if records.len() > max_sessions {
        let remaining = records.len() - max_sessions;
        lines.push(Line::from(match language {
            Language::Zh => format!("还有 {remaining} 次练习未显示，放大终端可查看更多。"),
            Language::En => format!("{remaining} more sessions hidden. Enlarge the terminal."),
        }));
    }

    lines
}

fn push_stats_line(lines: &mut Vec<Line<'static>>, max_lines: usize, line: Line<'static>) {
    if lines.len() < max_lines {
        lines.push(line);
    }
}

fn append_problem_bars(
    lines: &mut Vec<Line<'static>>,
    max_lines: usize,
    title: &'static str,
    entries: Vec<ProblemToken>,
    language: Language,
) {
    push_stats_line(
        lines,
        max_lines,
        Line::from(vec![Span::styled(
            title,
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        )]),
    );
    if entries.is_empty() {
        push_stats_line(
            lines,
            max_lines,
            Line::from(Span::styled(
                text(language, "stats_none"),
                Style::default().fg(Color::Gray),
            )),
        );
        return;
    }

    let max_errors = entries.iter().map(|entry| entry.errors).max().unwrap_or(1);
    for entry in entries {
        push_stats_line(
            lines,
            max_lines,
            problem_token_bar_line(entry, max_errors, language),
        );
    }
}

fn append_slow_bars(
    lines: &mut Vec<Line<'static>>,
    max_lines: usize,
    title: &'static str,
    entries: Vec<ProblemToken>,
    language: Language,
) {
    push_stats_line(
        lines,
        max_lines,
        Line::from(vec![Span::styled(
            title,
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        )]),
    );
    if entries.is_empty() {
        push_stats_line(
            lines,
            max_lines,
            Line::from(Span::styled(
                text(language, "stats_none"),
                Style::default().fg(Color::Gray),
            )),
        );
        return;
    }

    let max_score = entries.iter().map(|entry| entry.score).max().unwrap_or(1);
    for entry in entries {
        push_stats_line(
            lines,
            max_lines,
            slow_token_bar_line(entry, max_score, language),
        );
    }
}

fn problem_token_bar_line(
    entry: ProblemToken,
    max_errors: u32,
    language: Language,
) -> Line<'static> {
    let label = truncate(&entry.token.replace('\n', "\\n").replace('\t', "\\t"), 12);
    let bar = value_bar(entry.errors as f64, max_errors as f64, 8);
    let color = heat_color(entry.errors, max_errors);
    let count_label = match language {
        Language::Zh => format!("{}错/{}次", entry.errors, entry.count),
        Language::En => format!("{}e/{}x", entry.errors, entry.count),
    };
    Line::from(vec![
        Span::styled(
            format!("{label:<12} "),
            Style::default().fg(Color::Indexed(250)),
        ),
        Span::styled(bar, Style::default().fg(color)),
        Span::raw(" "),
        Span::styled(count_label, Style::default().fg(Color::Gray)),
    ])
}

fn slow_token_bar_line(entry: ProblemToken, max_score: u64, language: Language) -> Line<'static> {
    let label = truncate(&entry.token.replace('\n', "\\n").replace('\t', "\\t"), 12);
    let bar = value_bar(entry.score as f64, max_score as f64, 8);
    let avg_score = if entry.count == 0 {
        0
    } else {
        entry.score / u64::from(entry.count)
    };
    let color = if entry.score == max_score {
        Color::LightRed
    } else {
        Color::Yellow
    };
    let count_label = match language {
        Language::Zh => format!("{}ms/{}次", avg_score, entry.count),
        Language::En => format!("{}ms/{}x", avg_score, entry.count),
    };
    Line::from(vec![
        Span::styled(
            format!("{label:<12} "),
            Style::default().fg(Color::Indexed(250)),
        ),
        Span::styled(bar, Style::default().fg(color)),
        Span::raw(" "),
        Span::styled(count_label, Style::default().fg(Color::Gray)),
    ])
}

fn compact_problem_text(entries: Vec<ProblemToken>, language: Language) -> String {
    if entries.is_empty() {
        return text(language, "stats_none").to_string();
    }
    entries
        .into_iter()
        .map(|entry| format!("{}({})", truncate(&entry.token, 10), entry.errors))
        .collect::<Vec<_>>()
        .join("  ")
}

fn compact_key_text(entries: Vec<KeyProblem>, language: Language) -> String {
    if entries.is_empty() {
        return text(language, "stats_none").to_string();
    }
    entries
        .into_iter()
        .map(|entry| format!("{}({})", entry.label, entry.count))
        .collect::<Vec<_>>()
        .join("  ")
}

fn compact_slow_text(entries: Vec<ProblemToken>, language: Language) -> String {
    if entries.is_empty() {
        return text(language, "stats_none").to_string();
    }
    entries
        .into_iter()
        .map(|entry| {
            let avg_score = if entry.count == 0 {
                0
            } else {
                entry.score / u64::from(entry.count)
            };
            format!("{}({}ms)", truncate(&entry.token, 10), avg_score)
        })
        .collect::<Vec<_>>()
        .join("  ")
}

fn top_problem_tokens(records: &[&SessionRecord], words: bool, limit: usize) -> Vec<ProblemToken> {
    let mut aggregate = BTreeMap::<String, ProblemTokenAggregate>::new();
    for record in records {
        if record.token_stats.is_empty() {
            for (token, errors) in &record.error_tokens {
                if *errors == 0 || is_word_like_token(token) != words {
                    continue;
                }
                let token = normalize_problem_token(token, words);
                let entry = aggregate.entry(token).or_default();
                entry.errors += *errors;
                entry.count += 1;
                entry.score += u64::from(*errors) * 1_000;
            }
            continue;
        }

        for stat in &record.token_stats {
            if stat.errors == 0 || is_word_like_token(&stat.token) != words {
                continue;
            }
            let token = normalize_problem_token(&stat.token, words);
            let entry = aggregate.entry(token).or_default();
            entry.errors += stat.errors;
            entry.count += 1;
            entry.score +=
                u64::from(stat.errors) * 1_000 + stat.start_delay_ms + stat.duration_ms / 2;
        }
    }
    sorted_problem_tokens(aggregate, limit)
}

fn top_slow_tokens(records: &[&SessionRecord], limit: usize) -> Vec<ProblemToken> {
    let mut aggregate = BTreeMap::<String, ProblemTokenAggregate>::new();
    for record in records {
        if record.token_stats.is_empty() {
            for (token, errors) in &record.error_tokens {
                if *errors == 0 {
                    continue;
                }
                let token = normalize_problem_token(token, is_word_like_token(token));
                let entry = aggregate.entry(token).or_default();
                entry.errors += *errors;
                entry.count += 1;
                entry.score += u64::from(*errors) * 1_000;
            }
            continue;
        }

        for stat in &record.token_stats {
            let token = normalize_problem_token(&stat.token, is_word_like_token(&stat.token));
            let entry = aggregate.entry(token).or_default();
            entry.errors += stat.errors;
            entry.count += 1;
            entry.score +=
                stat.start_delay_ms + stat.duration_ms / 2 + u64::from(stat.errors) * 750;
        }
    }
    sorted_problem_tokens(aggregate, limit)
}

fn sorted_problem_tokens(
    aggregate: BTreeMap<String, ProblemTokenAggregate>,
    limit: usize,
) -> Vec<ProblemToken> {
    let mut entries = aggregate
        .into_iter()
        .map(|(token, aggregate)| ProblemToken {
            token,
            errors: aggregate.errors,
            count: aggregate.count,
            score: aggregate.score,
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| right.errors.cmp(&left.errors))
            .then_with(|| left.token.cmp(&right.token))
    });
    entries.truncate(limit);
    entries
}

fn is_word_like_token(token: &str) -> bool {
    token.chars().any(|ch| ch.is_ascii_alphabetic())
        && token
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

fn normalize_problem_token(token: &str, words: bool) -> String {
    if words && token.chars().all(|ch| ch.is_ascii_alphabetic()) {
        token.to_ascii_lowercase()
    } else {
        token.to_string()
    }
}

fn aggregate_key_errors(records: &[&SessionRecord]) -> BTreeMap<String, u32> {
    let mut counts = BTreeMap::<String, u32>::new();
    for record in records {
        for event in &record.key_events {
            if matches!(event.action, KeyAction::Insert) && !event.correct {
                let label = event
                    .expected
                    .or(event.input)
                    .map(key_bucket_for_char)
                    .unwrap_or_else(|| "extra".to_string());
                *counts.entry(label).or_default() += 1;
            }
        }
    }

    for record in records {
        if record.key_events.is_empty() {
            for (label, count) in &record.error_chars {
                *counts.entry(key_bucket_for_label(label)).or_default() += count;
            }
        }
    }

    counts
}

fn top_key_errors(records: &[&SessionRecord], limit: usize) -> Vec<KeyProblem> {
    let counts = aggregate_key_errors(records);
    let mut entries = counts
        .into_iter()
        .map(|(label, count)| KeyProblem { label, count })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.label.cmp(&right.label))
    });
    entries.truncate(limit);
    entries
}

fn keyboard_heatmap_lines(counts: &BTreeMap<String, u32>) -> Vec<Line<'static>> {
    keyboard_heatmap_rows(counts, false)
}

fn compact_keyboard_heatmap_lines(counts: &BTreeMap<String, u32>) -> Vec<Line<'static>> {
    keyboard_heatmap_rows(counts, true)
}

fn keyboard_heatmap_rows(counts: &BTreeMap<String, u32>, compact: bool) -> Vec<Line<'static>> {
    let max = counts.values().copied().max().unwrap_or(0);
    let full_rows: &[&[&str]] = &[
        &[
            "`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=",
        ],
        &[
            "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\",
        ],
        &[
            "a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'", "enter",
        ],
        &["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
        &["tab", "space"],
    ];
    let compact_rows: &[&[&str]] = &[
        &[
            "`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=",
        ],
        &[
            "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\",
        ],
        &[
            "a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'", "enter",
        ],
        &[
            "z", "x", "c", "v", "b", "n", "m", ",", ".", "/", "tab", "space",
        ],
    ];
    let rows = if compact { compact_rows } else { full_rows };

    rows.iter()
        .map(|row| {
            let mut spans = Vec::new();
            for (index, key) in row.iter().enumerate() {
                let count = counts.get(*key).copied().unwrap_or(0);
                if index > 0 {
                    spans.push(Span::raw(" "));
                }
                spans.push(Span::styled(
                    heatmap_key_label(key),
                    heat_cell_style(count, max),
                ));
            }
            Line::from(spans)
        })
        .collect()
}

fn heatmap_legend_line(language: Language, compact: bool) -> Line<'static> {
    let label = match (language, compact) {
        (Language::Zh, true) => "键位热力图",
        (Language::Zh, false) => "颜色深度",
        (Language::En, true) => "Key heatmap",
        (Language::En, false) => "Intensity",
    };
    let mut spans = vec![
        Span::styled(
            label,
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw("  "),
    ];
    for level in 0..=4 {
        if level > 0 {
            spans.push(Span::raw(" "));
        }
        spans.push(Span::styled(
            "    ",
            heat_cell_style_for_level(level, level == 4),
        ));
    }
    spans.push(Span::raw(match language {
        Language::Zh => "  少 -> 多",
        Language::En => "  low -> high",
    }));
    Line::from(spans)
}

fn heatmap_key_label(key: &str) -> String {
    let label = match key {
        "enter" => "ENT",
        "space" => "SPC",
        "tab" => "TAB",
        "\\" => "\\",
        other => other,
    };
    format!("{label:^4}")
}

fn heat_cell_style(value: u32, max: u32) -> Style {
    heat_cell_style_for_level(heat_level(value, max), value > 0 && value == max)
}

fn heat_cell_style_for_level(level: u8, strongest: bool) -> Style {
    let (fg, bg) = match level {
        0 => (Color::Indexed(250), Color::Indexed(236)),
        1 => (Color::White, Color::Indexed(65)),
        2 => (Color::Black, Color::Indexed(178)),
        3 => (Color::Black, Color::Indexed(166)),
        _ => (Color::White, Color::Indexed(160)),
    };
    let mut style = Style::default().fg(fg).bg(bg);
    if strongest {
        style = style.add_modifier(Modifier::BOLD);
    }
    style
}

fn heat_level(value: u32, max: u32) -> u8 {
    if value == 0 || max == 0 {
        return 0;
    }
    let ratio = value as f64 / max as f64;
    if ratio >= 0.75 {
        4
    } else if ratio >= 0.5 {
        3
    } else if ratio >= 0.25 {
        2
    } else {
        1
    }
}

fn key_bucket_for_label(label: &str) -> String {
    match label {
        "<space>" => "space".to_string(),
        "\\n" => "enter".to_string(),
        "\\t" => "tab".to_string(),
        _ => label
            .chars()
            .next()
            .map(key_bucket_for_char)
            .unwrap_or_default(),
    }
}

fn key_bucket_for_char(ch: char) -> String {
    match ch {
        '!' | '1' => "1",
        '@' | '2' => "2",
        '#' | '3' => "3",
        '$' | '4' => "4",
        '%' | '5' => "5",
        '^' | '6' => "6",
        '&' | '7' => "7",
        '*' | '8' => "8",
        '(' | '9' => "9",
        ')' | '0' => "0",
        '_' | '-' => "-",
        '+' | '=' => "=",
        '~' | '`' => "`",
        '{' | '[' => "[",
        '}' | ']' => "]",
        '|' | '\\' => "\\",
        ':' | ';' => ";",
        '"' | '\'' => "'",
        '<' | ',' => ",",
        '>' | '.' => ".",
        '?' | '/' => "/",
        ' ' => "space",
        '\n' => "enter",
        '\t' => "tab",
        ch if ch.is_ascii_alphabetic() => {
            return ch.to_ascii_lowercase().to_string();
        }
        ch => return ch.to_string(),
    }
    .to_string()
}

fn value_bar(value: f64, max: f64, width: usize) -> String {
    if max <= 0.0 {
        return "░".repeat(width);
    }
    let filled = ((value / max).clamp(0.0, 1.0) * width as f64)
        .ceil()
        .max(1.0) as usize;
    let mut bar = String::with_capacity(width);
    for index in 0..width {
        if index < filled {
            bar.push('█');
        } else {
            bar.push('░');
        }
    }
    bar
}

fn heat_color(value: u32, max: u32) -> Color {
    if value == 0 || max == 0 {
        return Color::DarkGray;
    }
    let ratio = value as f64 / max as f64;
    if ratio >= 0.75 {
        Color::LightRed
    } else if ratio >= 0.45 {
        Color::Yellow
    } else {
        Color::LightGreen
    }
}

fn session_line(index: usize, record: &SessionRecord, language: Language) -> Line<'static> {
    let started = record.started_at.with_timezone(&Local).format("%H:%M");
    let duration = format_duration_short(record.duration_ms, language);
    let source = truncate(&record.source, 22);
    match language {
        Language::Zh => Line::from(format!(
            "{}. {}  {}  WPM {:.1} | 正确率 {:.1}% | 错误 {} | 退格 {} | {}",
            index + 1,
            started,
            duration,
            record.wpm,
            record.accuracy,
            record.error_count,
            record.backspace_count,
            source
        )),
        Language::En => Line::from(format!(
            "{}. {}  {}  WPM {:.1} | acc {:.1}% | err {} | back {} | {}",
            index + 1,
            started,
            duration,
            record.wpm,
            record.accuracy,
            record.error_count,
            record.backspace_count,
            source
        )),
    }
}

fn stats_dates_from_records(records: &[&SessionRecord]) -> Vec<NaiveDate> {
    let mut dates = BTreeMap::<NaiveDate, ()>::new();
    for record in records {
        dates.insert(record.started_at.with_timezone(&Local).date_naive(), ());
    }
    dates.keys().rev().copied().collect()
}

fn records_for_date<'a>(records: &[&'a SessionRecord], date: NaiveDate) -> Vec<&'a SessionRecord> {
    let mut day_records = records
        .iter()
        .copied()
        .filter(|record| record.started_at.with_timezone(&Local).date_naive() == date)
        .collect::<Vec<_>>();
    day_records.sort_by_key(|record| record.started_at);
    day_records
}

fn recent_activity_text(records: &[&SessionRecord], language: Language) -> String {
    let dates = stats_dates_from_records(records);
    let mut parts = Vec::new();
    for date in dates.iter().take(2) {
        let day_records = records_for_date(records, *date);
        let minutes = day_records
            .iter()
            .map(|record| record.duration_ms)
            .sum::<u64>() as f64
            / 60_000.0;
        parts.push(format!(
            "{} {} {:.1}m",
            date.format("%m-%d"),
            minute_bar(minutes, 20.0, 6),
            minutes
        ));
    }
    if parts.is_empty() {
        return text(language, "stats_no_recent").to_string();
    }
    match language {
        Language::Zh => format!("最近 {}", parts.join("  ")),
        Language::En => format!("recent {}", parts.join("  ")),
    }
}

fn minute_bar(value: f64, target: f64, width: usize) -> String {
    let ratio = if target <= 0.0 {
        1.0
    } else {
        (value / target).clamp(0.0, 1.0)
    };
    let filled = (ratio * width as f64).round() as usize;
    let mut bar = String::with_capacity(width);
    for index in 0..width {
        if index < filled {
            bar.push('█');
        } else {
            bar.push('░');
        }
    }
    bar
}

fn record_error_rate(record: &SessionRecord) -> Option<f64> {
    if record.target_len == 0 {
        return None;
    }
    Some(f64::from(record.error_count) / record.target_len as f64 * 100.0)
}

fn average(values: impl Iterator<Item = f64>) -> f64 {
    let mut count = 0usize;
    let mut sum = 0.0;
    for value in values {
        count += 1;
        sum += value;
    }
    if count == 0 { 0.0 } else { sum / count as f64 }
}

fn weighted_accuracy(records: &[&SessionRecord]) -> f64 {
    let typed_len = records
        .iter()
        .map(|record| effective_typed_len(record))
        .sum::<usize>();
    if typed_len == 0 {
        return average(records.iter().map(|record| record.accuracy));
    }

    records
        .iter()
        .map(|record| {
            record.accuracy.clamp(0.0, 100.0) / 100.0 * effective_typed_len(record) as f64
        })
        .sum::<f64>()
        / typed_len as f64
        * 100.0
}

fn effective_typed_len(record: &SessionRecord) -> usize {
    if record.typed_len > 0 {
        return record.typed_len;
    }
    record.user_input.chars().count().max(record.correct_chars)
}

fn aggregate_wpm(records: &[&SessionRecord]) -> f64 {
    let duration_ms = records.iter().map(|record| record.duration_ms).sum::<u64>();
    if duration_ms == 0 {
        return average(records.iter().map(|record| record.wpm));
    }

    let correct_chars = records
        .iter()
        .map(|record| record.correct_chars)
        .sum::<usize>();
    let minutes = duration_ms.max(1) as f64 / 60_000.0;
    correct_chars as f64 / 5.0 / minutes
}

fn lesson_color(kind: LessonKind) -> Color {
    match kind {
        LessonKind::Warmup => Color::Cyan,
        LessonKind::Chunks => Color::LightGreen,
        LessonKind::CommonWords => Color::Green,
        LessonKind::Words => Color::Green,
        LessonKind::Symbols => Color::Yellow,
        LessonKind::Naming => Color::Magenta,
        LessonKind::CodeBlock => Color::LightBlue,
    }
}

fn lesson_title(kind: LessonKind, language: Language) -> &'static str {
    match language {
        Language::Zh => match kind {
            LessonKind::Warmup => "热身：基础键位",
            LessonKind::Chunks => "词块：英文拼写块",
            LessonKind::CommonWords => "高频词：英语常用词",
            LessonKind::Words => "单词：前端高频词",
            LessonKind::Symbols => "专项：数字和符号",
            LessonKind::Naming => "命名：大小写和前端 API",
            LessonKind::CodeBlock => "代码块：前端短代码",
        },
        Language::En => match kind {
            LessonKind::Warmup => "Warmup: base keys",
            LessonKind::Chunks => "Chunks: English spelling blocks",
            LessonKind::CommonWords => "High frequency: common English words",
            LessonKind::Words => "Words: frontend vocabulary",
            LessonKind::Symbols => "Drill: numbers and symbols",
            LessonKind::Naming => "Naming: case and frontend APIs",
            LessonKind::CodeBlock => "Code blocks: short frontend code",
        },
    }
}

fn lesson_purpose(kind: LessonKind, language: Language) -> &'static str {
    match language {
        Language::Zh => match kind {
            LessonKind::Warmup => "把手指放稳，只追正确率",
            LessonKind::Chunks => "练常见开头、结尾和字母组合",
            LessonKind::CommonWords => "练真正高频英文单词，不混大小写",
            LessonKind::Words => "练常见英文单词和变量名",
            LessonKind::Symbols => "解决代码输入掉速的主要来源",
            LessonKind::Naming => "适应 camelCase、PascalCase 和 DOM/React 名称",
            LessonKind::CodeBlock => "练完整代码块，不练单行碎片",
        },
        Language::En => match kind {
            LessonKind::Warmup => "Settle fingers; type accurately",
            LessonKind::Chunks => "Prefixes, suffixes, and letter patterns",
            LessonKind::CommonWords => "Common lowercase English words",
            LessonKind::Words => "Frontend words and identifiers",
            LessonKind::Symbols => "Numbers and code symbols",
            LessonKind::Naming => "camelCase, PascalCase, DOM/React",
            LessonKind::CodeBlock => "Complete code blocks, not one-line fragments",
        },
    }
}

fn text(language: Language, key: &str) -> &'static str {
    match language {
        Language::Zh => match key {
            "terminal_small" => "终端窗口太小，无法显示 KeyLoop。",
            "practice_menu" => "练习菜单",
            "menu_comprehensive" => "综合练习",
            "menu_comprehensive_hint" => "按今日计划从第 1 组练到第 7 组",
            "menu_stats" => "数据统计",
            "menu_stats_hint" => "查看总览、历史最好成绩和每天练习明细",
            "menu_help" => "↑/↓ 或 J/K：选择 | Enter：开始/进入 | L：切换语言 | Esc/Q：退出",
            "menu_mode_label" => "综合",
            "status_title" => "状态",
            "stats_title" => "数据统计",
            "stats_overview" => "总览",
            "stats_tabs" => "统计页面",
            "stats_dashboard" => "总览诊断",
            "stats_details" => "每日明细",
            "stats_diagnosis" => "弱项诊断",
            "stats_by_day" => "按日期",
            "stats_help" => "←/→ 日期 | Home/End 最新/最早 | L 语言 | Esc 返回 | Q 退出",
            "stats_empty" => "还没有练习记录。完成一次练习后这里会显示统计数据。",
            "stats_empty_day" => "这一天没有练习记录。",
            "stats_no_recent" => "暂无最近记录",
            "stats_none" => "暂无",
            "stats_radar" => "弱项雷达",
            "stats_error_words" => "高错词 / 词块",
            "stats_error_symbols" => "高错符号",
            "stats_key_heat" => "键位热力图",
            "stats_slow_tokens" => "慢词块",
            "today_plan" => "今日练习",
            "today_summary" => "今日总结",
            "daily_progress" => "今日进度",
            "daily_target" => "今日练习目标",
            "practiced" => "已练",
            "remaining" => "还差",
            "done" => "已完成",
            "next" => "下一组",
            "pending" => "待练",
            "controls" => "操作",
            "plan_help" => "Enter：开始今日练习 | L：切换语言 | Esc/Q：退出",
            "daily_goal_hint" => "建议今天练满 20 分钟，可以零碎时间分几次完成。",
            "session_complete" => "本组完成",
            "next_lesson" => "Enter 进入下一组",
            "finish_today" => "Enter 查看今日总结",
            "complete_help" => "Enter：继续 | R：重练本组 | L：切换语言 | Esc/Q：保存退出",
            "summary_help" => "Enter：回到今日练习 | L：切换语言 | Esc/Q：保存退出",
            "result_title" => "结果",
            "raw_wpm" => "原始",
            "accuracy" => "正确率",
            "errors" => "错误",
            "backspace" => "退格",
            "slow_focus" => "慢项",
            "not_started" => "未开始",
            "source_label" => "来源",
            "esc_help" => "返回/退出",
            "language_help" => "语言",
            "ime_help" => "中文输入法提交会被忽略",
            "ignored_non_ascii" => "已忽略非 ASCII 输入",
            "ghost_title" => "跟打文本",
            "metrics_title" => "指标",
            "progress_title" => "本组进度",
            "current_lesson" => "当前课程",
            "lesson_progress" => "课程",
            "lesson" => "课程",
            "no_completed_lessons" => "今天还没有完成的课程。",
            _ => "",
        },
        Language::En => match key {
            "terminal_small" => "Terminal is too small for KeyLoop.",
            "practice_menu" => "Practice menu",
            "menu_comprehensive" => "Full practice",
            "menu_comprehensive_hint" => "Follow today's plan from lesson 1 to lesson 7",
            "menu_stats" => "Stats",
            "menu_stats_hint" => "Overview, personal bests, and daily session details",
            "menu_help" => "Up/Down or J/K: choose | Enter: start/open | L: language | Esc/Q: quit",
            "menu_mode_label" => "full",
            "status_title" => "Status",
            "stats_title" => "Stats",
            "stats_overview" => "Overview",
            "stats_tabs" => "Stats pages",
            "stats_dashboard" => "Overview diagnosis",
            "stats_details" => "Daily detail",
            "stats_diagnosis" => "Diagnosis",
            "stats_by_day" => "By date",
            "stats_help" => {
                "Left/Right date | Home/End newest/oldest | L language | Esc menu | Q quit"
            }
            "stats_empty" => "No practice records yet. Complete a session to see statistics.",
            "stats_empty_day" => "No practice records on this day.",
            "stats_no_recent" => "no recent records",
            "stats_none" => "none yet",
            "stats_radar" => "Weakness radar",
            "stats_error_words" => "High-error words/chunks",
            "stats_error_symbols" => "High-error symbols",
            "stats_key_heat" => "Key heatmap",
            "stats_slow_tokens" => "Slow tokens",
            "today_plan" => "Today's practice",
            "today_summary" => "Today summary",
            "daily_progress" => "Daily progress",
            "daily_target" => "Daily target",
            "practiced" => "done",
            "remaining" => "remaining",
            "done" => "done",
            "next" => "next",
            "pending" => "pending",
            "controls" => "Controls",
            "plan_help" => "Enter: start today's practice | L: language | Esc/Q: quit",
            "daily_goal_hint" => "Recommended target is 20 minutes today. Short sessions count.",
            "session_complete" => "Lesson complete",
            "next_lesson" => "Enter for next lesson",
            "finish_today" => "Enter for today summary",
            "complete_help" => {
                "Enter: continue | R: repeat lesson | L: language | Esc/Q: save and exit"
            }
            "summary_help" => "Enter: back to today plan | L: language | Esc/Q: save and exit",
            "result_title" => "Result",
            "raw_wpm" => "raw",
            "accuracy" => "accuracy",
            "errors" => "errors",
            "backspace" => "backspace",
            "slow_focus" => "Slow focus",
            "not_started" => "not started",
            "source_label" => "source",
            "esc_help" => "back/exit",
            "language_help" => "language",
            "ime_help" => "Chinese IME commits are ignored",
            "ignored_non_ascii" => "ignored non-ASCII",
            "ghost_title" => "Ghost text",
            "metrics_title" => "Metrics",
            "progress_title" => "Lesson progress",
            "current_lesson" => "Current lesson",
            "lesson_progress" => "lesson",
            "lesson" => "lesson",
            "no_completed_lessons" => "No completed lessons today.",
            _ => "",
        },
    }
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
        let mut app = App::new(plan, Vec::new(), Language::Zh);
        app.started = Some(Instant::now());
        app.target_chars = vec!['a'];

        handle_running_key(&mut app, KeyCode::Char('你'), KeyModifiers::NONE);

        assert_eq!(app.ignored_non_ascii, 1);
        assert!(app.input.is_empty());
        assert!(app.events.is_empty());
    }

    #[test]
    fn menu_zero_key_does_not_select_first_item() {
        let plan = DailyPracticePlan {
            target_minutes: 20,
            completed_ms: 0,
            lessons: Vec::new(),
        };
        let mut app = App::new(plan, Vec::new(), Language::Zh);
        app.menu_index = app.stats_menu_index();

        handle_menu_key(&mut app, KeyCode::Char('0'));

        assert_eq!(app.menu_index, app.stats_menu_index());
    }

    #[test]
    fn target_lines_marks_wrong_newline_input() {
        let wrapped = target_lines(&['a', '\n', 'b'], &['a', 'x'], 16);

        assert_eq!(wrapped.lines.len(), 2);
        assert_eq!(wrapped.lines[0].spans.len(), 2);
        assert_eq!(wrapped.lines[0].spans[1].content.as_ref(), "↵");
        assert_eq!(wrapped.lines[0].spans[1].style, wrong_text_style());
    }

    #[test]
    fn target_lines_wraps_newline_marker_at_width_boundary() {
        let wrapped = target_lines(&['a', '\n', 'b'], &[], 1);

        assert_eq!(wrapped.lines[0].spans[0].content.as_ref(), "a");
        assert_eq!(wrapped.lines[1].spans[0].content.as_ref(), "↵");
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
}
