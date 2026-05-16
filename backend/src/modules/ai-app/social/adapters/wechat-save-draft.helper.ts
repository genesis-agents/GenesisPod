/**
 * WeChat saveDraft helper —— 在浏览器 page context 执行的纯函数。
 *
 * 拆分自 wechat.adapter.ts（god-class size guard：>2500 行单次 +50 行硬拒）。
 * 保留为 browser-side function 以便 puppeteer page.evaluate 序列化传过去。
 *
 * 职责：
 * 1. 从多个来源解析 fingerprint（sniffed → window.wx → cgiData → inline script → outerHTML）
 * 2. 依次尝试 3 个 saveDraft schema 变体，首个 ret=0+appMsgId 即胜
 * 3. 把每次尝试的 ret / err_msg / body 切片聚合返回
 */

export interface SaveDraftApiParams {
  token: string;
  title: string;
  author: string;
  digest: string;
  content: string;
  sniffedFingerprint: string;
  /** 封面图 media_id（来自素材库 upload），空字符串表示无封面 */
  thumbMediaId: string;
  /** 封面图 CDN URL，配合 thumbMediaId 一起出现，空表示无封面 */
  coverCdnUrl: string;
}

export interface SaveDraftApiResult {
  status: number;
  fingerprint: string;
  fpSource: string;
  bodyPreview: string;
  json: {
    base_resp?: { ret?: number; err_msg?: string };
    ret?: number;
    appMsgId?: number | string;
  } | null;
}

/**
 * 由 page.evaluate 调用。注意：函数体被 puppeteer 序列化后在 browser context
 * 执行，禁止依赖任何 import / closure / TypeScript helper 类型。所有内嵌类型
 * 必须用 inline `as unknown as ...`。
 */
export async function runSaveDraftAttempts(
  params: SaveDraftApiParams,
): Promise<SaveDraftApiResult> {
  // 1. fingerprint 来源优先级：
  //    a) sniffed (publish() 顶部 page.on('request') 真鼠标侧捕获)
  //    b) window.wx.commonData.fingerprint / .t
  //    c) window.cgiData.fingerprint / .t
  //    d) inline script 扫描
  //    e) outerHTML 全文兜底
  let fingerprint = params.sniffedFingerprint || "";
  let fpSource = fingerprint ? "sniffed" : "";

  if (!fingerprint) {
    const wx = (
      window as unknown as {
        wx?: {
          fp?: { t?: string } | string;
          commonData?: { fingerprint?: string; t?: string };
        };
      }
    ).wx;
    if (wx?.commonData?.fingerprint) {
      fingerprint = wx.commonData.fingerprint;
      fpSource = "window.wx.commonData.fingerprint";
    } else if (wx?.commonData?.t) {
      fingerprint = wx.commonData.t;
      fpSource = "window.wx.commonData.t";
    } else if (typeof wx?.fp === "string") {
      fingerprint = wx.fp;
      fpSource = "window.wx.fp(string)";
    } else if (typeof wx?.fp === "object" && wx.fp !== null && "t" in wx.fp) {
      fingerprint = wx.fp.t || "";
      fpSource = "window.wx.fp.t";
    }
  }

  if (!fingerprint) {
    const cgiData = (
      window as unknown as {
        cgiData?: { fingerprint?: string; t?: string };
      }
    ).cgiData;
    if (cgiData?.fingerprint) {
      fingerprint = cgiData.fingerprint;
      fpSource = "window.cgiData.fingerprint";
    } else if (cgiData?.t) {
      fingerprint = cgiData.t;
      fpSource = "window.cgiData.t";
    }
  }

  if (!fingerprint) {
    const scripts = Array.from(document.scripts);
    for (const s of scripts) {
      const m = s.textContent?.match(
        /(?:fingerprint|"t"|'t'|\bt)["':\s]+["']([a-f0-9]{32})["']/,
      );
      if (m) {
        fingerprint = m[1];
        fpSource = "inline-script";
        break;
      }
    }
  }

  if (!fingerprint) {
    const html = document.documentElement.outerHTML;
    const m = html.match(/["']([a-f0-9]{32})["']/);
    if (m) {
      fingerprint = m[1];
      fpSource = "outerHTML";
    }
  }

  // 2. 多 schema 候选 —— PR #97 单 schema "appmsgid=0/index=0/type=10"
  //    返回 ret=200002 "参数错误"；PR #96 多图文 schema 返回 ret=444002
  //    "旧版图文素材"。两端都不对，PR #99 尝试几个中间变体：
  //    a) multi-article 改进：count=1 + title0/content0 + AppMsgId 用真 hash
  //    b) 加 thumb_media_id=0 fallback（type=10 长文 WeChat 通常要求封面）
  //    c) 切换 endpoint：/cgi-bin/appmsg?action=add_appmsg
  const rand = () => Math.random().toString();
  const commonFields = {
    token: params.token,
    lang: "zh_CN",
    f: "json",
    ajax: "1",
    fingerprint,
  };
  const hasCover = !!params.thumbMediaId && !!params.coverCdnUrl;
  const sharedArticleFields = {
    title: params.title,
    author: params.author,
    digest: params.digest,
    content: params.content,
    sourceurl: "",
    fileid: "",
    cdn_url_1_1: hasCover ? params.coverCdnUrl : "",
    show_cover_pic: "0",
    need_open_comment: "1",
    only_fans_can_comment: "0",
    ad_type: "0",
    copyright_type: "0",
    can_reward: "0",
    can_open_reward: "0",
    thumb_media_id: hasCover ? params.thumbMediaId : "0",
  };

  const schemas: Array<{
    name: string;
    endpoint: string;
    body: Record<string, string>;
  }> = [
    {
      name: "v1-single-no-suffix",
      endpoint: `/cgi-bin/operate_appmsg?t=ajax-response&sub=create&token=${params.token}&lang=zh_CN`,
      body: {
        ...commonFields,
        random: rand(),
        appmsgid: "0",
        index: "0",
        type: "10",
        ...sharedArticleFields,
      },
    },
    {
      name: "v2-multi-suffixed-count1",
      endpoint: `/cgi-bin/operate_appmsg?t=ajax-response&sub=create&token=${params.token}&lang=zh_CN`,
      body: {
        ...commonFields,
        random: rand(),
        AppMsgId: "",
        count: "1",
        title0: params.title,
        author0: params.author,
        digest0: params.digest,
        content0: params.content,
        sourceurl0: "",
        fileid0: "",
        cdn_url_1_10: hasCover ? params.coverCdnUrl : "",
        show_cover_pic0: "0",
        need_open_comment0: "1",
        only_fans_can_comment0: "0",
        ad_type0: "0",
        copyright_type0: "0",
        can_reward0: "0",
        can_open_reward0: "0",
        thumb_media_id0: hasCover ? params.thumbMediaId : "0",
      },
    },
    {
      name: "v3-appmsg-add",
      endpoint: `/cgi-bin/appmsg?action=add_appmsg&token=${params.token}&lang=zh_CN`,
      body: {
        ...commonFields,
        random: rand(),
        type: "10",
        ...sharedArticleFields,
      },
    },
  ];

  const attempts: Array<{
    name: string;
    status: number;
    ret: number | string | undefined;
    err_msg: string | undefined;
    bodyPreview: string;
  }> = [];

  let winningJson: SaveDraftApiResult["json"] = null;
  let winningStatus = 0;

  for (const schema of schemas) {
    const body = new URLSearchParams(schema.body);
    const res = await fetch(schema.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: body.toString(),
      credentials: "include",
    });
    const text = await res.text();
    let json: SaveDraftApiResult["json"] = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON
    }
    const r = json?.base_resp?.ret ?? json?.ret;
    attempts.push({
      name: schema.name,
      status: res.status,
      ret: r,
      err_msg: json?.base_resp?.err_msg,
      bodyPreview: text.slice(0, 800),
    });
    if (r === 0 && json?.appMsgId) {
      winningJson = json;
      winningStatus = res.status;
      break;
    }
  }

  return {
    status: winningStatus || attempts[attempts.length - 1].status,
    fingerprint,
    fpSource,
    bodyPreview: JSON.stringify(attempts).slice(0, 2500),
    json: winningJson,
  };
}
