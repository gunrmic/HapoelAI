declare module 'robots-parser' {
  export interface RobotsEvaluator {
    isAllowed(url: string, userAgent?: string): boolean;
    isDisallowed(url: string, userAgent?: string): boolean;
    getCrawlDelay(userAgent?: string): number | undefined;
    getSitemaps(): string[];
  }

  export default function robotsParser(
    robotsUrl: string,
    robotsTxt: string,
    options?: { allowOnNeutral?: boolean },
  ): RobotsEvaluator;
}


