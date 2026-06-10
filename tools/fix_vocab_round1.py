# Rewrites for authored sentences that failed the reading-vocabulary gate.
# Key: original text. Value: (new_text, new_translation_zh).

FIXES = {
    # ---- high_school ----
    "The store closes at nine on weekdays.":
        ("The store is open until nine every day.", "这家店每天营业到九点。"),
    "This soup tastes a little too salty for me.":
        ("This food has a little too much salt for me.", "这食物对我来说盐放得有点多。"),
    "We had pizza and salad for lunch today.":
        ("We had rice and fish for lunch today.", "我们今天午饭吃了米饭和鱼。"),
    "Can I borrow your pen for a minute?":
        ("Can I use your phone for a minute?", "我能用一下你的手机吗？"),
    "He was so tired after practice that he fell asleep right after dinner.":
        ("He was so sleepy after practice that he went to bed right after dinner.", "训练后他太困了，吃完晚饭就上床睡觉了。"),
    "Dad fixed the broken chair in the garden while Mom painted the front door.":
        ("Father fixed the broken chair in the garden while Mother cleaned the front door.", "爸爸修好了花园里坏掉的椅子，妈妈把前门擦干净了。"),
    "My father taught me how to plant tomatoes last spring, and this summer we picked enough from the garden to share with all of our neighbors.":
        ("My father showed me how to plant vegetables last spring, and this summer we got enough from the garden to share with everyone near our house.", "去年春天爸爸教我种菜，今年夏天我们从园子里收获的蔬菜多到可以分给家附近的每个人。"),
    "My grandmother says that when she was a girl, the town had no buses at all, and she walked five kilometers to school in every season.":
        ("My grandmother says that when she was a girl, the town had no bus at all, and she had to walk a long way to school in every season.", "奶奶说她小时候镇上根本没有公交车，无论什么季节她都得走很远的路去上学。"),
    "On the first day of the holiday, we packed sandwiches and fruit, took the early train to the coast, and stayed on the beach until sunset.":
        ("On the first day of the holiday, we put bread and fruit in a bag, took the early train to the sea, and played on the beach until the evening.", "假期第一天，我们把面包和水果装进包里，坐早班火车去海边，在沙滩上一直玩到傍晚。"),
    "I wanted to surprise my mother on her birthday, so I got up early, cleaned the kitchen, and made her favorite breakfast with eggs and toast.":
        ("I wanted to make my mother happy on her birthday, so I got up early, washed the dishes, and made her favorite breakfast.", "我想在妈妈生日那天让她开心，所以早早起床洗了碗，还做了她最爱吃的早餐。"),
    # ---- cet4 ----
    "The traffic downtown is terrible on Friday evenings.":
        ("The traffic downtown is very heavy on Friday nights.", "周五晚上市中心的交通非常拥堵。"),
    "He volunteers at the animal shelter on weekends.":
        ("He helps at the animal center every weekend.", "他每个周末都在动物中心帮忙。"),
    "My roommate suggested that we split the housework instead of arguing about it every week.":
        ("My roommate said we should share the housework instead of fighting about it every week.", "我室友说我们应该分担家务，而不是每周为此吵架。"),
    "The flight attendant kindly helped me find space for my luggage in the overhead bin.":
        ("The staff on the plane helped me find space for my bags above the seat.", "机上工作人员帮我在座位上方找到了放包的空间。"),
    "I accidentally deleted the file, but luckily my colleague had saved a backup copy.":
        ("I removed the file by mistake, but my workmate had saved another copy.", "我误删了文件，但同事保存了另一份副本。"),
    # ---- cet6 ----
    "Her argument was convincing but lacked solid evidence.":
        ("Her argument sounded strong but had little solid evidence.", "她的论点听起来有力，但缺乏可靠的证据。"),
    "Housing prices in the suburbs continue to climb.":
        ("House prices outside the city continue to rise.", "城外的房价持续上涨。"),
    "Their startup attracted investment from several firms.":
        ("Their new company received investment from several firms.", "他们的新公司获得了几家公司的投资。"),
    "She handles customer complaints with remarkable patience.":
        ("She deals with customer complaints in a calm and patient way.", "她以冷静耐心的方式处理顾客投诉。"),
    "The union demanded safer conditions for factory workers.":
        ("The union asked for better and safe conditions for factory workers.", "工会要求为工厂工人提供更好且安全的工作条件。"),
    "Critics praised the film for its honest storytelling.":
        ("Critics liked the film because it tells an honest story.", "影评人喜欢这部电影，因为它讲述了一个真诚的故事。"),
    "The charity relies heavily on monthly donations from a small group of loyal supporters.":
        ("The charity depends mainly on monthly gifts from a small group of faithful members.", "这家慈善机构主要依靠一小群忠实成员的每月捐赠。"),
    "The airline apologized for the lengthy delay and offered passengers meal vouchers, hotel accommodation, and a full refund for those who chose to cancel.":
        ("The airline said sorry for the long delay and offered free meals, hotel rooms, and a full refund for those who chose to cancel.", "航空公司为长时间延误道歉，提供免费餐食和酒店房间，选择取消行程的乘客可获全额退款。"),
    "The program pairs retired professionals with young entrepreneurs, giving the founders practical advice while offering the retirees a meaningful way to share their experience.":
        ("The program connects retired experts with young business owners, giving the new companies practical advice while letting the older generation share their experience.", "该项目让退休专家与年轻创业者建立联系，为新公司提供实用建议，也让老一辈得以分享经验。"),
    "After the documentary aired, donations to the wildlife sanctuary tripled, allowing the staff to expand the rescue program and hire two full-time veterinarians.":
        ("After the documentary was shown on television, support for the wildlife park grew three times, allowing the staff to expand the rescue program and hire two animal doctors.", "纪录片在电视播出后，对野生动物园的支持增长了三倍，工作人员得以扩大救助项目并聘请两名兽医。"),
    # ---- postgraduate ----
    "The committee questioned the validity of the framework.":
        ("The committee doubted whether the framework was valid.", "委员会怀疑该框架是否有效。"),
    "His analysis draws on archival sources from three countries.":
        ("His analysis is based on archive sources from three countries.", "他的分析基于来自三个国家的档案资料。"),
    "Interdisciplinary collaboration enriched the research design.":
        ("Cooperation across fields made the research design much richer.", "跨领域合作大大丰富了研究设计。"),
    "Their model predicts outcomes with surprising accuracy.":
        ("Their model can predict outcomes with unusual accuracy.", "他们的模型能以异乎寻常的准确度预测结果。"),
    "The author acknowledges the limitations of the dataset but defends the overall conclusions.":
        ("The author admits the limits of the data but stands by the overall conclusions.", "作者承认数据的局限，但坚持总体结论。"),
    "The workshop trained doctoral students to communicate their findings to non-academic audiences.":
        ("The workshop helped research students learn to explain their findings to the general public.", "工作坊帮助研究生学会向公众解释他们的研究发现。"),
    "Initial enthusiasm for the technique faded once independent laboratories repeatedly failed to reproduce the original findings under the published conditions.":
        ("Early excitement about the technique cooled after independent laboratories failed again and again to repeat the original findings under the same conditions.", "当独立实验室在相同条件下一再无法重复原始结果后，人们对该技术最初的兴奋逐渐冷却。"),
    "The dissertation argues that the reforms succeeded not because of their design but because local officials quietly adapted them to fit existing practices.":
        ("The thesis suggests that the reform worked not because of its design but because local officials adjusted it in silence to fit existing practice.", "该论文提出，改革奏效并非因为其设计，而是因为地方官员默默调整了它以适应现有做法。"),
    "Replication efforts in psychology have prompted methodological reforms, including the preregistration of hypotheses and the open sharing of raw data and analysis code.":
        ("Repeat studies in psychology have pushed the field to reform its methods, including registering each hypothesis in advance and openly sharing raw data and analysis code.", "心理学领域的重复研究推动了方法改革，包括提前注册每个假设以及公开共享原始数据和分析代码。"),
    "Drawing on court records and personal diaries, the historian reconstructs how ordinary citizens experienced and resisted the sweeping legal reforms of the period.":
        ("Using court records and personal papers, the scholar shows how ordinary citizens lived through and pushed back against the great legal changes of the period.", "这位学者利用法庭记录和私人文件，展示了普通公民如何经历并抵制那个时期的重大法律变革。"),
    "Careful reanalysis showed that the celebrated effect disappeared once the researchers accounted for differences in how the regions reported their statistics.":
        ("A careful second analysis showed that the famous effect was gone once the researchers allowed for differences in how each region reported its statistics.", "仔细的二次分析表明，一旦研究者考虑各地区统计上报方式的差异，那个著名的效应便不复存在。"),
    # ---- toefl_ielts ----
    "Automation will inevitably reshape the global labor market.":
        ("Automation will certainly transform the global labor market.", "自动化必将改变全球劳动力市场。"),
    "The legislation imposes stricter penalties on industrial polluters.":
        ("The new law brings much heavier penalties for industrial pollution.", "新法律对工业污染处以重得多的处罚。"),
    "Coral reefs are extraordinarily sensitive to temperature fluctuations.":
        ("Coral is extremely sensitive to small changes in sea temperature.", "珊瑚对海水温度的微小变化极为敏感。"),
    "The author employs irony to expose social hypocrisy.":
        ("The author uses sharp humor to expose social pretense.", "作者用犀利的幽默揭露社会的虚伪。"),
    "Linguistic diversity is declining at an alarming rate.":
        ("Language diversity is falling at a speed that should alarm us.", "语言多样性正以令人警觉的速度减少。"),
    "The verdict established an important legal precedent.":
        ("The court decision set an important example for future law.", "这一法院判决为未来的法律树立了重要先例。"),
    "Excessive screen time correlates with disrupted sleep patterns.":
        ("Too much screen time is closely linked with poor sleep patterns.", "屏幕时间过长与糟糕的睡眠模式密切相关。"),
    "The theory elegantly reconciles two competing explanations.":
        ("The theory brings two competing explanations together with rare grace.", "该理论以罕见的优雅将两种相互竞争的解释统一起来。"),
    "Archaeologists unearthed artifacts predating the earliest written records.":
        ("Researchers dug up objects far older than the earliest written records.", "研究人员挖掘出远早于最早文字记录的物品。"),
    "The glacier has retreated visibly within a single generation.":
        ("The mountain ice has clearly drawn back within a single generation.", "仅一代人的时间，山上的冰川就明显退缩了。"),
    "Algorithmic bias perpetuates existing social inequalities.":
        ("Bias built into software can deepen the gaps that already divide society.", "内嵌于软件的偏见会加深已经分裂社会的鸿沟。"),
    "Proponents of the carbon tax contend that market incentives outperform direct regulation in reducing emissions.":
        ("Supporters of the carbon tax argue that market rewards work better than direct rules in cutting emissions.", "碳税的支持者认为，在减排方面市场激励比直接管制更有效。"),
    "Satellite data reveals that deforestation has accelerated despite international commitments to halt it.":
        ("Satellite data shows that forest loss has sped up despite international promises to stop it.", "卫星数据显示，尽管国际社会承诺制止，森林消失的速度仍在加快。"),
    "Advocates insist that universal basic income would liberate workers to pursue education and entrepreneurship.":
        ("Its defenders claim that universal basic income would free workers to pursue education and start new businesses.", "其拥护者声称，全民基本收入将使劳动者能够自由地接受教育和创业。"),
    "The infrastructure bill stalled in parliament as factions disputed how the costs should be distributed.":
        ("The infrastructure bill stopped moving in parliament as rival groups argued over how to divide the costs.", "由于对立派别就成本分摊争执不下，基础设施法案在议会停滞不前。"),
    "Marine biologists documented previously unknown species thriving around deep-sea volcanic vents.":
        ("Ocean scientists recorded unknown species living in rich numbers around hot openings in the deep sea floor.", "海洋科学家记录了在深海热泉口周围大量生存的未知物种。"),
    "The curriculum reform emphasizes critical thinking over the memorization of isolated facts.":
        ("The new curriculum values critical thinking above the memory of isolated facts.", "新课程重视批判性思维，而非对孤立事实的记忆。"),
    "Economists warn that prolonged trade disputes could fragment global supply chains irreversibly.":
        ("Experts warn that a long trade war could break global supply chains beyond repair.", "专家警告，旷日持久的贸易战可能使全球供应链断裂到无法修复。"),
    "The retrospective exhibition traces the artist's evolution from figurative painting to pure abstraction.":
        ("The exhibition follows the artist's journey from realistic painting to pure abstract art.", "展览追溯了这位艺术家从写实绘画到纯抽象艺术的历程。"),
    "Psychologists distinguish between fleeting happiness and the deeper satisfaction derived from purposeful work.":
        ("Psychology separates brief pleasure from the deeper satisfaction that comes from work with purpose.", "心理学区分了短暂的快乐与源于有目标的工作的更深层满足。"),
    "The drought devastated harvests across the region, driving food prices to unprecedented levels.":
        ("The long dry season destroyed crops across the region, driving food prices to record levels.", "漫长的旱季摧毁了该地区的庄稼，将粮价推至创纪录的水平。"),
    "Defenders of the humanities argue that literature cultivates empathy in ways no other discipline can.":
        ("Those who defend the humanities argue that literature builds understanding of others in ways no other field can.", "人文学科的捍卫者认为，文学以其他领域无法替代的方式培养对他人的理解。"),
    "Glacial melt threatens the water supply of communities that depend on seasonal runoff for irrigation.":
        ("The loss of mountain ice puts at risk the water supply of communities that depend on it to water their fields.", "山地冰川的消失威胁着依赖其灌溉农田的社区的供水。"),
    "Proponents of rewilding argue that restoring apex predators produces cascading ecological benefits, although ranchers and rural communities remain understandably wary of the policy.":
        ("Supporters argue that bringing back large wild animals produces a chain of natural benefits, although farmers and rural communities remain careful about the policy for good reason.", "支持者认为让大型野生动物回归会产生一连串自然效益，尽管农民和乡村社区对这一政策保持谨慎也是有道理的。"),
    "Conservationists face an uncomfortable dilemma: the tourism that funds protection of endangered habitats simultaneously introduces noise, waste, and disturbance into those very ecosystems.":
        ("Nature protection faces a hard choice: the tourism that pays for saving wild places also brings noise, waste, and pressure into those same fragile systems.", "自然保护面临艰难抉择：为保护荒野买单的旅游业，同时也把噪音、垃圾和压力带进了这些脆弱的系统。"),
    "Advances in gene editing have outpaced the regulatory frameworks designed to govern them, leaving scientists, ethicists, and lawmakers struggling to define acceptable boundaries.":
        ("Progress in gene editing has moved faster than the rules meant to govern it, leaving scientists and lawmakers struggling to define acceptable limits.", "基因编辑的进展快于旨在管理它的规则，使科学家和立法者都在艰难界定可接受的界限。"),
    "The commission concluded that the blackout resulted not from any single failure but from a cascade of minor faults, each manageable alone, interacting in ways no operator had anticipated.":
        ("The inquiry concluded that the power failure came not from one big error but from a chain of small problems, each easy to handle alone, combining in ways no operator had expected.", "调查的结论是，停电并非源于单个重大错误，而是一连串小问题——每个单独看都容易处理——以无人预料的方式叠加所致。"),
    "The observatory's data archive, accumulated patiently over half a century, proved decisive in confirming the gravitational phenomenon that theorists had predicted but never observed.":
        ("The observatory's data archive, built with patience over half a century, proved decisive in confirming a deep physical effect that theory had predicted but no one had observed.", "天文台耐心积累了半个世纪的数据档案，对证实理论预言却无人观测到的深层物理效应起了决定性作用。"),
    "Whether the city's experiment with participatory budgeting genuinely redistributes power or merely legitimizes decisions already made elsewhere remains the subject of heated scholarly debate.":
        ("Whether the city's experiment in letting residents direct public spending truly shifts power, or merely dresses up decisions already made elsewhere, remains a matter of heated academic debate.", "该市让居民支配公共开支的试验究竟是真正转移了权力，还是只为别处已做的决定披上外衣，仍是学界激烈争论的问题。"),
}
