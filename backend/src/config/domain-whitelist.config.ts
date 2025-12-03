/**
 * 域名白名单配置
 *
 * 这个文件定义了哪些域名被允许通过代理访问
 * 可以轻松添加新域名，无需重新编译代码
 *
 * 使用方式：
 * 1. 添加新域名到 WHITELISTED_DOMAINS 数组
 * 2. 重启后端服务 (自动重加载)
 * 3. 新域名立即生效
 */

export const WHITELISTED_DOMAINS = [
  // 学术平台 (Academic Platforms)
  "arxiv.org",
  "alphaxiv.org",
  "www.alphaxiv.org",
  "openreview.net",
  "papers.nips.cc",
  "proceedings.mlr.press",

  // 代码仓库 (Code Repositories)
  "github.com",
  "raw.githubusercontent.com",

  // 社交媒体 (Social Media)
  "reddit.com",
  "old.reddit.com",

  // 科技新闻 (Tech News)
  "techcrunch.com",
  "venturebeat.com",
  "wired.com",
  "theverge.com",
  "arstechnica.com",
  "torrentfreak.com",

  // 博客和媒体 (Blogs & Media)
  "medium.com",
  "towardsdatascience.com",
  "news.ycombinator.com",
  "blog.cloudflare.com",
  "blog.tensorflow.org",
  "newsletter.semianalysis.com",
  "dev.to",
  "hashnode.com",
  "substack.com",

  // 科技公司博客 (Tech Company Blogs)
  "blog.google",
  "ai.googleblog.com",
  "openai.com",
  "blog.openai.com",
  "deepmind.com",
  "deepmind.google",
  "blogs.nvidia.com",

  // 政府和政策 (Government & Policy)
  "whitehouse.gov",
  "www.whitehouse.gov",
  "congress.gov",
  "www.congress.gov",
  "senate.gov",
  "www.senate.gov",
  "house.gov",
  "www.house.gov",
  "state.gov",
  "www.state.gov",
  "treasury.gov",
  "www.treasury.gov",
  "commerce.gov",
  "www.commerce.gov",

  // 智库和研究机构 (Think Tanks & Research)
  "brookings.edu",
  "www.brookings.edu",
  "cfr.org",
  "www.cfr.org",
  "csis.org",
  "www.csis.org",
  "rand.org",
  "www.rand.org",
  "heritage.org",
  "www.heritage.org",

  // 大学政策研究 (University Policy Research)
  "law.stanford.edu",
  "cyber.harvard.edu",
  "carnegieendowment.org",
  "www.carnegieendowment.org",
  "cset.georgetown.edu", // Center for Security and Emerging Technology

  // 主流媒体 (Mainstream Media)
  "forbes.com",
  "www.forbes.com",
  "www.bbc.com",
  "www.theguardian.com",
  "www.freep.com",
  "wallstreetcn.com",
  "montananewsroom.com",

  // 技术博客和个人网站 (Tech Blogs & Personal Sites)
  "andreacanton.dev",
  "beets.io",
  "brunosutic.com",
  "cbarrete.com",
  "ciju.in",
  "conradresearch.com",
  "cprimozic.net",
  "danielmangum.com",
  "dfir.ch",
  "eclecticlight.co",
  "emiruz.com",
  "filbot.com",
  "how-did-i-get-here.net",
  "ilovetypography.com",
  "itiner-e.org",
  "kensegall.com",
  "krebsonsecurity.com",
  "mccd.space",
  "mullvad.net",
  "news.itsfoss.com",
  "newsletter.masilotti.com",
  "nilostolte.github.io",
  "purplesyringa.moe",
  "thejpster.org.uk",
  "waywo.eamag.me",
  "willmorrison.net",
  "www.ctnicholas.dev",
  "www.reifyworks.com",
  "www.theregister.com",

  // 学术和教育 (Academia & Education)
  "en.wikipedia.org",
  "fsfe.org",
  "homepage.cs.uiowa.edu",
  "nubianfoundation.org",
  "softwarepreservation.computerhistory.org",
  "www.ai.mit.edu",
  "www.cerebras.ai",
  "www.construction-physics.com",
  "www.crockford.com",
  "www.cs.utexas.edu",
  "www.hrw.org",
  "www.nyu.edu",
  "www.prisma.io",

  // 视频平台 (Video Platforms)
  "www.youtube.com",
  "www.ted.com",

  // 其他 (Others)
  "myticker.com",
  "www.myticker.com",
  "xslt.rip",
  "epoch.ai",
];

/**
 * 检查域名是否在白名单中
 * 支持子域名匹配 (例如: api.github.com 可以匹配 github.com)
 */
export function isDomainAllowed(hostname: string): boolean {
  return WHITELISTED_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

/**
 * 获取白名单中不包含的新域名
 * 用于监控和调试
 */
export function getNewDomains(hostnames: string[]): string[] {
  return hostnames.filter((hostname) => !isDomainAllowed(hostname));
}
