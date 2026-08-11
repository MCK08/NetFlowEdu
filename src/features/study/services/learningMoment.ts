import { LearningTrend } from "./learningTrend";
import { TopicInsight } from "./learningInsights";

// Phase 25 — the Learning Hub's one-line "bugünkü durumun" moment (§10).
// A fixed set of deterministic Turkish templates, never generated text —
// picks ONE sentence from real trend + weakTopics data already computed
// elsewhere. No AI, no invented percentage, no new data source.

export function buildLearningMoment(
  trend: LearningTrend,
  weakTopics: readonly TopicInsight[],
): string {
  const topWeak = weakTopics[0] ?? null;

  if (trend === "insufficient_data") {
    return "Henüz yeterli veri yok. Birkaç soru daha çöz.";
  }

  if (trend === "declining" && topWeak) {
    return `Son çalışmalarında ${topWeak.subject} / ${topWeak.topic} konusunda daha fazla zorlandın.`;
  }

  if (trend === "declining") {
    return "Son çalışmalarında biraz daha fazla zorlandın.";
  }

  if (trend === "improving") {
    return "Son tekrarlarında düzenli ilerliyorsun.";
  }

  // stable
  if (topWeak) {
    return `${topWeak.subject} / ${topWeak.topic} konusu hâlâ dikkat istiyor.`;
  }
  return "Son tekrarlarında istikrarlısın.";
}
