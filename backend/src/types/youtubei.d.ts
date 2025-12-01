declare module "youtubei.js" {
  export class Innertube {
    static create(config?: any): Promise<Innertube>;
    getInfo(videoId: string): Promise<any>;
  }

  export namespace Log {
    const Level: {
      NONE: number;
      ERROR: number;
      WARNING: number;
      INFO: number;
      DEBUG: number;
    };
    function setLevel(...args: number[]): void;
  }
}
