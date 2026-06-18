import request from "request";
import { randomBytes } from "crypto";

/**
 * steam-session's getWebCookies() возвращает cookie случайного домена (promiseAny),
 * а steamLoginSecure доменно-специфичен (aud: web:community / web:store / ...).
 * Здесь повторяем минимальный поток finalizelogin -> settoken именно для
 * steamcommunity.com, чтобы получить cookie с aud=web:community.
 */

const API_HEADERS = {
  accept: "application/json, text/plain, */*",
  "sec-fetch-site": "cross-site",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
};

interface TransferInfo {
  url: string;
  params: { [key: string]: any };
}

export default function getCommunityWebCookies(
  refreshToken: string,
  steamID: string,
  proxyUrl?: string | null
): Promise<string[]> {
  const req = proxyUrl ? request.defaults({ proxy: proxyUrl }) : request;

  return new Promise<string[]>((resolve, reject) => {
    req.post(
      {
        url: "https://login.steampowered.com/jwt/finalizelogin",
        headers: API_HEADERS,
        formData: {
          nonce: refreshToken,
          sessionid: randomBytes(12).toString("hex"),
          redir: "https://steamcommunity.com/login/home/?goto=",
        },
      },
      (err: any, _resp: any, body: any) => {
        if (err) return reject(err);
        let json: any;
        try {
          json = JSON.parse(body);
        } catch (e) {
          return reject(new Error(`finalizelogin: malformed response`));
        }
        if (json.error) return reject(new Error(`finalizelogin error ${json.error}`));
        const transfers: TransferInfo[] = json.transfer_info || [];
        const community = transfers.find((t) => /steamcommunity\.com/i.test(t.url));
        if (!community) return reject(new Error("no steamcommunity.com transfer in finalizelogin"));

        req.post(
          {
            url: community.url,
            formData: { steamID, ...community.params },
          },
          (err2: any, resp2: any) => {
            if (err2) return reject(err2);
            const setCookie: string[] = (resp2 && resp2.headers && resp2.headers["set-cookie"]) || [];
            const cookies = setCookie.map((c) => c.split(";")[0].trim());
            if (!cookies.some((c) => c.startsWith("steamLoginSecure="))) {
              return reject(new Error("no steamLoginSecure in settoken response"));
            }
            resolve(cookies);
          }
        );
      }
    );
  });
}
