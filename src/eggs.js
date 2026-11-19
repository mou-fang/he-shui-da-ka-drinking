// 彩蛋主题：27 个主题（鸡尾酒 / 虚构饮品 / 水世界），每天按日期哈希决定。
// 彩蛋日概率约 60%，每个主题约 1–2% 的日子出现。
// 主题只改变水球颜色、名称和一句文案，不影响打卡数据与物理。
//
// 隐藏的非饮品彩蛋：原版另有按日期 / 时刻 / 动作触发的隐藏彩蛋，
// 这里只留扩展点，不捏造具体内容。想加自己的隐藏彩蛋时，往
// HIDDEN_EGGS 里按 { id, when(state, now), apply(theme) } 的格式加。
export const HIDDEN_EGGS = []; // 扩展点：见 README「彩蛋」一节

export const EGG_THEMES = [
  { id: "lemon-soda", kind: "drink", name: "柠檬气泡水", top: "#bfe8ff", deep: "#2f9be8", note: "今天的水，带点柠檬的清爽。" },
  { id: "mint", kind: "drink", name: "薄荷冰水", top: "#c8f5dd", deep: "#1fae7a", note: "薄荷味的今天，喝起来凉凉的。" },
  { id: "peach-tea", kind: "drink", name: "蜜桃乌龙茶", top: "#ffd9c2", deep: "#e8845a", note: "蜜桃香，乌龙底，今天是茶味的一天。" },
  { id: "blue-hawaii", kind: "cocktail", name: "蓝色夏威夷", top: "#aee6ff", deep: "#1e7fe0", note: "无酒精版蓝色夏威夷，海边度假感。" },
  { id: "mojito", kind: "cocktail", name: "莫吉托", top: "#d2f2c0", deep: "#3da35d", note: "青柠 + 薄荷，今天也要清醒一点。" },
  { id: "sunset", kind: "cocktail", name: "落日余晖", top: "#ffe1a8", deep: "#e86a3a", note: "像落日一样橙，慢慢喝完今天。" },
  { id: "grape", kind: "drink", name: "葡萄苏打", top: "#e3c8ff", deep: "#8a5cf6", note: "紫色气泡，吨吨吨。" },
  { id: "cola", kind: "drink", name: "冰可乐", top: "#e8c39a", deep: "#7a4a21", note: "今天的水，假装是冰可乐。" },
  { id: "milk-tea", kind: "drink", name: "珍珠奶茶", top: "#f2d8b3", deep: "#b07a3e", note: "三分糖去冰——哦不，今天还是喝水。" },
  { id: "matcha", kind: "drink", name: "抹茶拿铁", top: "#d8ecc0", deep: "#5d8a3c", note: "抹茶绿的一天，稳稳地喝。" },
  { id: "strawberry", kind: "drink", name: "草莓牛奶", top: "#ffd3de", deep: "#e85a8a", note: "粉粉的草莓牛奶味。" },
  { id: "ocean", kind: "world", name: "深海", top: "#9fd4ff", deep: "#0b4f8a", note: "今天的水来自深海，咸咸的——开玩笑的。" },
  { id: "glacier", kind: "world", name: "冰川融水", top: "#dff4ff", deep: "#4aa8d8", note: "冰川一样干净透亮。" },
  { id: "spring", kind: "world", name: "山泉", top: "#c9ecff", deep: "#2e8b6e", note: "山里的泉水，凉凉的。" },
  { id: "rain", kind: "world", name: "雨天", top: "#cdd9e8", deep: "#5a7ba6", note: "听着雨声喝水。" },
  { id: "aurora", kind: "world", name: "极光", top: "#c8ffe9", deep: "#3aa88a", note: "极光在水里晃。" },
  { id: "starry", kind: "world", name: "星空", top: "#cdd2ff", deep: "#4a4fa8", note: "把星星喝下去。" },
  { id: "sunrise", kind: "world", name: "日出", top: "#ffe9b8", deep: "#e89a3a", note: "新的一天，从一杯水开始。" },
  { id: "sakura", kind: "world", name: "樱花", top: "#ffd9e8", deep: "#e87aa8", note: "樱花落在水面上。" },
  { id: "forest", kind: "world", name: "森林晨雾", top: "#d5ecd8", deep: "#4a8a5d", note: "森林里的晨雾味。" },
  { id: "honey", kind: "drink", name: "蜂蜜柠檬水", top: "#ffe9a8", deep: "#d8a02e", note: "甜甜的蜂蜜柠檬。" },
  { id: "coconut", kind: "drink", name: "椰子水", top: "#eef7e8", deep: "#7ab86e", note: "椰子味的清爽。" },
  { id: "blueberry", kind: "drink", name: "蓝莓气泡", top: "#d3c8ff", deep: "#6a5ae0", note: "蓝莓在水里冒泡。" },
  { id: "taro", kind: "drink", name: "芋泥波波", top: "#e8dcff", deep: "#9a7ad8", note: "芋泥味，但今天没有小料。" },
  { id: "magic-potion", kind: "fictional", name: "魔法药水", top: "#e0c8ff", deep: "#8a3ad8", note: "喝了会 +10 体力的药水（并没有）。" },
  { id: "mana", kind: "fictional", name: "法力药水", top: "#a8d8ff", deep: "#2e6ad8", note: "蓝条回满了。" },
  { id: "phoenix", kind: "fictional", name: "凤凰之泪", top: "#ffd8a8", deep: "#e87a2e", note: "传说中的水，喝了会发光。" },
];

function hashDate(dateStr) {
  let h = 2166136261;
  for (const ch of dateStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// 返回 { theme } 或 null（非彩蛋日不预告、不展示横幅）。
export function eggForDate(dateStr) {
  const h = hashDate(dateStr);
  if (h % 100 >= 60) return null; // 约 60% 的日子是彩蛋日
  return EGG_THEMES[h % EGG_THEMES.length];
}
