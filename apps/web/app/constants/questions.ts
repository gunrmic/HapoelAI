import { type Locale } from '@/i18n';

export const PREMADE_QUESTIONS = {
  he: [
    "מי הם השחקנים המפורסמים ביותר של הפועל תל אביב?",
    "ספר לי על אליפויות שהקבוצה זכתה בהן",
    "מה אתה יודע על ערן זהבי?",
    "איזה הישגים יש לקבוצה בהיסטוריה שלה?",
    "ספר לי על משחקים מפורסמים של הפועל",
    "מי היריבות הגדולות של הפועל תל אביב?",
    "מתי הוקמה הקבוצה?",
    "מי היו המאמנים המפורסמים של הפועל?",
    "ספר לי על דרבי תל אביב",
    "מה אתה יודע על גביע המדינה של הפועל?",
    "איזה שחקנים כבשו הכי הרבה שערים?",
    "ספר לי על משחקים אירופיים של הפועל",
    "מהם הרגעים הבלתי נשכחים בהיסטוריה של המועדון?",
    "איזה שיאים יש למועדון?",
    "מה המיוחד באוהדי הפועל תל אביב?",
    "ספר לי על עונות מוצלחות של הקבוצה",
    "מי השחקנים עם הכי הרבה הופעות?",
    "מה אתה יודע על אצטדיון בלומפילד?",
    "איזה זכרונות יש ממשחקים נגד מכבי תל אביב?",
    "מי היו נשיאי המועדון?",
    "ספר לי על תקופות זהב של הקבוצה",
    "מה הסמל של המועדון מסמל?",
    "איזה שחקנים עברו מהפועל לנבחרת ישראל?",
    "מה הצבעים של המועדון ולמה?",
    "ספר לי על ירידות ועליות של הקבוצה",
    "מי המאמן הכי מצליח בהיסטוריה של המועדון?",
    "איזה גביעים זכתה הקבוצה?",
    "מה קורה בעונה הנוכחית?",
    "ספר לי על שחקנים זרים מפורסמים שהשחקו בפועל",
    "מהי המשמעות של המועדון לעיר תל אביב?",
  ],
  en: [
    "Who are the most famous players of Hapoel Tel Aviv?",
    "Tell me about championships the team has won",
    "What do you know about Eran Zahavi?",
    "What achievements does the team have in its history?",
    "Tell me about famous Hapoel matches",
    "Who are the biggest rivals of Hapoel Tel Aviv?",
    "When was the team founded?",
    "Who were the famous coaches of Hapoel?",
    "Tell me about the Tel Aviv derby",
    "What do you know about Hapoel's State Cup victories?",
    "Which players scored the most goals?",
    "Tell me about Hapoel's European matches",
    "What are the unforgettable moments in the club's history?",
    "What records does the club hold?",
    "What's special about Hapoel Tel Aviv fans?",
    "Tell me about successful seasons of the team",
    "Who are the players with the most appearances?",
    "What do you know about Bloomfield Stadium?",
    "What memories are there from matches against Maccabi Tel Aviv?",
    "Who were the club's presidents?",
    "Tell me about the golden eras of the team",
    "What does the club's emblem symbolize?",
    "Which players moved from Hapoel to the Israeli national team?",
    "What are the club's colors and why?",
    "Tell me about the team's relegations and promotions",
    "Who is the most successful coach in the club's history?",
    "What trophies has the team won?",
    "What's happening in the current season?",
    "Tell me about famous foreign players who played for Hapoel",
    "What is the significance of the club to the city of Tel Aviv?",
  ],
};

/**
 * Get 4 random questions from the pre-made questions array for the given locale
 */
export function getRandomQuestions(locale: Locale, count: number = 4): string[] {
  // Ensure locale is valid, default to 'he' if not
  const validLocale: Locale = (locale === 'en' || locale === 'he') ? locale : 'he';
  const questions = PREMADE_QUESTIONS[validLocale];
  if (!questions || questions.length === 0) {
    // Fallback to Hebrew if questions array is empty
    return PREMADE_QUESTIONS.he.slice(0, count);
  }
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Get a random question that is not in the excluded list for the given locale
 */
export function getRandomQuestionExcluding(locale: Locale, exclude: string[]): string {
  // Ensure locale is valid, default to 'he' if not
  const validLocale: Locale = (locale === 'en' || locale === 'he') ? locale : 'he';
  const questions = PREMADE_QUESTIONS[validLocale];
  const available = questions.filter(q => !exclude.includes(q));
  if (available.length === 0) {
    // If all questions are excluded, return a random one anyway
    return questions[Math.floor(Math.random() * questions.length)];
  }
  return available[Math.floor(Math.random() * available.length)];
}

