#!/usr/bin/env node
import fs from "node:fs";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node tools/score-xingtu-capture.mjs <capture.json>");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const blocks = [...(payload.rows || []), ...(payload.cards || [])]
  .map((item) => ({
    type: item.type,
    text: clean(item.text || item.cells?.join(" ") || ""),
    links: item.links || []
  }))
  .filter((item) => item.text.length > 12);

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function numberAfter(text, keywords) {
  for (const keyword of keywords) {
    const match = text.match(new RegExp(`${keyword}.{0,12}?([0-9]+(?:\\.[0-9]+)?)(万|w|W|元)?`));
    if (match) return Number(match[1]);
  }
  return null;
}

function inferName(text, links) {
  const namedLink = links.find((link) => link.text && link.text.length >= 2 && link.text.length <= 24);
  if (namedLink) return namedLink.text;
  return text.split(/[｜|·,，]/)[0].slice(0, 18) || "待识别达人";
}

function inferTarget(text) {
  if (/学生|校园|初中生|同学/.test(text)) return "student";
  if (/老师|班主任|亲子|家长/.test(text)) return "mixed";
  return "parent";
}

function inferTags(text) {
  const tags = [];
  if (/初一/.test(text)) tags.push("初一");
  if (/初二/.test(text)) tags.push("初二");
  if (/初三|中考/.test(text)) tags.push("初三");
  if (/数学/.test(text)) tags.push("数学");
  if (/英语/.test(text)) tags.push("英语");
  if (/物理/.test(text)) tags.push("物理");
  if (/全科|多学科/.test(text)) tags.push("全科");
  if (/家长|亲子/.test(text)) tags.push("家长");
  if (/老师|班主任/.test(text)) tags.push("老师");
  return [...new Set(tags)].slice(0, 6);
}

function riskFlags(text) {
  const flags = [];
  if (/保证提分|包过|必过|必上|升学保障/.test(text)) flags.push("疑似承诺效果");
  if (/命题|阅卷|官方资源|内部资料|押题/.test(text)) flags.push("疑似考试资源暗示");
  if (/焦虑|落后|毁掉/.test(text)) flags.push("疑似焦虑营销");
  if (/竞品|作业帮|猿辅导|学而思|小猿|斑马/.test(text)) flags.push("竞品相关");
  return flags;
}

function scoreBlock(block, index) {
  const text = block.text;
  const fans = numberAfter(text, ["粉丝", "粉丝数"]) || 0;
  const quote = numberAfter(text, ["报价", "参考价", "刊例价", "价格"]) || 0;
  const avgPlay = numberAfter(text, ["均播", "播放", "近30日"]) || 0;
  const interaction = numberAfter(text, ["互动率", "点赞率", "完播率"]) || 0;
  const target = inferTarget(text);
  const tags = inferTags(text);
  const risks = riskFlags(text);
  const hasXingtuId = /星图|XT|达人ID|达人id/.test(text);
  const hasAudience = /人群包|覆盖度|匹配度|观众画像|TA/.test(text);
  const hasCommercial = /A3|组件|商单|履约|CPM|CPE|看后搜|回搜/.test(text);
  const hasCompetitor = risks.includes("竞品相关");
  const hasEducation = /初中|中考|初一|初二|初三|数学|英语|物理|全科|学习|提分/.test(text);

  const propagation = clamp(55 + Math.log10(avgPlay + 1) * 18 + Math.min(interaction, 20) * 0.8, 45, 94);
  const audience = clamp(58 + (hasAudience ? 18 : 0) + (hasEducation ? 10 : 0) + (target === "student" ? -4 : 0), 45, 94);
  const commercial = clamp(60 + (hasCommercial ? 18 : 0) + (quote > 0 && quote <= 3 ? 6 : 0) + (quote > 6 ? -8 : 0), 42, 92);
  const competition = clamp(86 - (hasCompetitor ? 18 : 0), 45, 94);
  const content = clamp(64 + (hasEducation ? 14 : 0) + (/全科/.test(text) ? 8 : 0) + (/老师|班主任|家长/.test(text) ? 5 : 0), 45, 94);
  const confidence = clamp(58 + (hasXingtuId ? 10 : 0) + (hasAudience ? 12 : 0) + (hasCommercial ? 8 : 0) + (avgPlay ? 6 : 0) - (risks.length ? 8 : 0), 35, 92);
  const score = Math.round((propagation * 0.22 + audience * 0.24 + commercial * 0.22 + competition * 0.17 + content * 0.15) - Math.max(0, 78 - confidence) * 0.18);
  const recommendation = risks.some((risk) => /承诺|考试|焦虑/.test(risk))
    ? "暂缓，先过合规"
    : score >= 86 && confidence >= 82
      ? "A档优先邀约"
      : score >= 78
        ? "B档测试合作"
        : score >= 70
          ? "C档补数观察"
          : "暂不推荐";

  return {
    index,
    name: inferName(text, block.links),
    target,
    tags,
    fans,
    quote,
    score,
    confidence,
    recommendation,
    dimensions: {
      propagation: Math.round(propagation),
      audience: Math.round(audience),
      commercial: Math.round(commercial),
      competition: Math.round(competition),
      content: Math.round(content)
    },
    risks,
    links: block.links,
    evidence: text.slice(0, 500)
  };
}

const candidates = blocks
  .map(scoreBlock)
  .filter((item) => item.tags.length || item.fans || item.quote || item.links.length)
  .sort((a, b) => b.score - a.score);

const result = {
  source: payload.source,
  page_title: payload.page_title,
  page_url: payload.page_url,
  captured_at: payload.captured_at,
  scored_at: new Date().toISOString(),
  candidate_count: candidates.length,
  candidates
};

console.log(JSON.stringify(result, null, 2));
