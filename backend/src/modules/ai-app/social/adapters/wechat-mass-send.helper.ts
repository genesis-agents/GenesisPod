/**
 * WeChat massSend (群发/发表) helper —— 在浏览器 page context 执行的纯函数。
 *
 * 拆分自 wechat.adapter.ts（god-class size guard：>2500 行单次 +50 行硬拒）。
 *
 * 职责：
 * 1. 不依赖 sniffer 拿 fingerprint（saveDraft 之后 sniffState 闭包不在调用栈）
 * 2. 依次尝试 3 个 publish endpoint，首个 ret=0 即胜
 * 3. bypass UI 发表按钮触发的 "未授权切换账号" 客户端校验对话框
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

  const schemas: Array<{
    name: string;
    endpoint: string;
    body: Record<string, string>;
  }> = [
    {
      name: "freepublish-submit",
      endpoint: `/cgi-bin/freepublish?token=${params.token}&lang=zh_CN`,
      body: {
        ...common,
        appmsgid: params.appmsgid,
        type: "10",
        format: "json",
        action: "submit",
      },
    },
    {
      name: "operate-appmsg-publish",
      endpoint: `/cgi-bin/operate_appmsg?t=ajax-response&sub=publish&token=${params.token}&lang=zh_CN`,
      body: {
        ...common,
        AppMsgId: params.appmsgid,
        type: "10",
      },
    },
    {
      name: "masssend-submit",
      endpoint: `/cgi-bin/masssend?action=submit&token=${params.token}&lang=zh_CN`,
      body: {
        ...common,
        appmsgid: params.appmsgid,
        type: "10",
        tofansnum: "1",
        groupid: "-1",
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
      bodyPreview: text.slice(0, 800),
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
