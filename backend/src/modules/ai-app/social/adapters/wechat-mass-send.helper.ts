/**
 * WeChat massSend (群发/发表) helper —— 在浏览器 page context 执行的纯函数。
 *
 * PR #101 attempt 结果：
 *   freepublish-submit: HTTP 404 (路径错)
 *   operate-appmsg-publish: ret=2 (params 不全 / 不对)
 *   masssend-submit: ret=200009 not found (action 不对)
 *
 * PR #102 iteration #16：
 *   - 从观察到的 masssend?action=check_music body 反推真群发 schema 用
 *     item_list=JSON 而非各字段平铺
 *   - 加 hook window.fetch 装在 page 上，把页面随后发起的任何 publish 相关
 *     请求 URL 收集起来 → 至少暴露 WeChat 真用的 endpoint 名供下轮针对
 *   - 试更多 endpoint 路径变体：/freepublish/publish, /freepublish/post,
 *     /masssend?action=batch_send, operate_appmsg?sub=submit
 */

export interface MassSendApiParams {
  token: string;
  appmsgid: string;
}

export interface MassSendApiResult {
  attempts: Array<{
    name: string;
    status: number;
    ret: number | string | undefined;
    err_msg: string | undefined;
    bodyPreview: string;
  }>;
  winning: {
    name: string;
    msgDataId?: string;
    publishId?: string;
  } | null;
}

/**
 * 由 page.evaluate 调用。函数体被 puppeteer 序列化后在 browser context 执行，
 * 禁止依赖 import / closure / TypeScript helper 类型。
 */
export async function runMassSendAttempts(
  params: MassSendApiParams,
): Promise<MassSendApiResult> {
  // 提取 fingerprint（不依赖 sniffer）
  let fingerprint = "";
  const wx = (
    window as unknown as {
      wx?: { commonData?: { fingerprint?: string; t?: string } };
    }
  ).wx;
  if (wx?.commonData?.fingerprint) fingerprint = wx.commonData.fingerprint;
  else if (wx?.commonData?.t) fingerprint = wx.commonData.t;
  if (!fingerprint) {
    const html = document.documentElement.outerHTML;
    const m = html.match(/["']([a-f0-9]{32})["']/);
    if (m) fingerprint = m[1];
  }

  const common = {
    token: params.token,
    lang: "zh_CN",
    f: "json",
    ajax: "1",
    fingerprint,
    random: Math.random().toString(),
  };

  // item_list JSON 包 — 观察到 masssend check_music 用这个 shape
  const itemListJson = JSON.stringify({
    list: [
      {
        appmsgid: params.appmsgid,
        idx: "1",
      },
    ],
  });

  const schemas: Array<{
    name: string;
    endpoint: string;
    body: Record<string, string>;
  }> = [
    {
      name: "masssend-submit-itemlist",
      endpoint: `/cgi-bin/masssend?action=submit&token=${params.token}&lang=zh_CN`,
      body: {
        ...common,
        appmsgid: params.appmsgid,
        item_list: itemListJson,
        type: "10",
        tofansnum: "1",
        groupid: "-1",
        sex: "0",
        country: "",
        province: "",
        city: "",
      },
    },
    {
      name: "operate-appmsg-submit",
      endpoint: `/cgi-bin/operate_appmsg?t=ajax-response&sub=submit&token=${params.token}&lang=zh_CN`,
      body: {
        ...common,
        AppMsgId: params.appmsgid,
        count: "1",
        SubmitType: "0",
      },
    },
    {
      name: "operate-appmsg-publish-full",
      endpoint: `/cgi-bin/operate_appmsg?t=ajax-response&sub=publish&token=${params.token}&lang=zh_CN`,
      body: {
        ...common,
        AppMsgId: params.appmsgid,
        type: "10",
        count: "1",
        groupid: "-1",
        sex: "0",
        country: "",
        province: "",
        city: "",
        tofansnum: "1",
        SubmitType: "0",
      },
    },
    {
      name: "freepublish-post",
      endpoint: `/cgi-bin/freepublish?action=post&token=${params.token}&lang=zh_CN`,
      body: {
        ...common,
        appmsgid: params.appmsgid,
        type: "10",
      },
    },
    {
      name: "appmsgpublish",
      endpoint: `/cgi-bin/appmsgpublish?token=${params.token}&lang=zh_CN`,
      body: {
        ...common,
        action: "submit",
        appmsgid: params.appmsgid,
        type: "10",
      },
    },
  ];

  const attempts: MassSendApiResult["attempts"] = [];
  let winning: MassSendApiResult["winning"] = null;

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
    let json: {
      base_resp?: { ret?: number; err_msg?: string };
      ret?: number;
      msg_data_id?: string;
      publish_id?: string;
    } | null = null;
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
      bodyPreview: text.slice(0, 600),
    });
    if (r === 0) {
      winning = {
        name: schema.name,
        msgDataId: json?.msg_data_id,
        publishId: json?.publish_id,
      };
      break;
    }
  }

  return { attempts, winning };
}
