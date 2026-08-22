# Rules sources and implementation status

GuanDan Lab is a teaching implementation, not an official rule publication. The baseline is the 2022 **《竞技掼蛋竞赛规则（试行）》**, reviewed by the General Administration of Sport's Board and Card Games Administrative Center (中国棋院).

Primary public references:

- [国家体育总局棋牌运动管理中心：掼牌（掼蛋）赛事活动办赛指南](https://www.sport.gov.cn/qpzx/n27319064/n27319058/c27429584/content.html), which cites the trial competition rules as a governing document.
- [国家体育总局棋牌运动管理中心：2022 年征求《竞技掼蛋扑克竞赛规则》意见的公告索引](https://www.sport.gov.cn/qpzx/n5384/index_3654_26.html).
- [国家体育总局：赛事采用棋牌中心审定的试行规则与补充规定](https://www.sport.gov.cn/n14471/n14495/n14543/c27199805/content.html).

## Implemented teaching scope

- Two 54-card decks, four seats and fixed opposite-seat partnerships.
- Singles, pairs, triples, triple-with-pair, straight, three consecutive pairs, two consecutive triples, rank bombs, straight flushes and four-joker bomb.
- Level cards and the heart level-card wildcard within supported multi-card patterns.
- Following, passing, trick reset, partner take-over, finish order, double-up and level advancement.
- Common single/double tribute, return tribute and two-big-joker resistance flow.

## Known teaching simplifications

- Tournament organization, clocks, penalties, duplicate formats, appeals and scoring tables are outside the game engine.
- Tribute and return tribute are automated for training rather than selected interactively.
- Regional table customs may differ on display, reporting and edge cases. They must be implemented as named variants, not silently mixed into the baseline.
- Before changing a ruling, add a minimal card fixture and cite the exact baseline section or regional source in the Rule Issue template.
