declare module "turndown" {
  interface TurndownOptions {
    headingStyle?: "setext" | "atx";
    hr?: string;
    bulletListMarker?: "-" | "+" | "*";
    codeBlockStyle?: "indented" | "fenced";
    fence?: "```" | "~~~";
    emDelimiter?: "_" | "*";
    strongDelimiter?: "__" | "**";
    linkStyle?: "inlined" | "referenced";
    linkReferenceStyle?: "full" | "collapsed" | "shortcut";
  }

  interface Rule {
    filter: string | string[] | ((node: HTMLElement) => boolean);
    replacement: (content: string, node: HTMLElement) => string;
  }

  class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(html: string | HTMLElement): string;
    addRule(key: string, rule: Rule): this;
    use(
      plugins:
        | ((service: TurndownService) => void)
        | ((service: TurndownService) => void)[],
    ): this;
    remove(filter: string | string[] | ((node: HTMLElement) => boolean)): this;
  }

  export default TurndownService;
}
