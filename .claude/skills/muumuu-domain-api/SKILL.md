---
name: muumuu-domain-api
description: ムームードメイン API v2 (MeAPI) を Web アプリケーションに組み込むときに使用する。ドメイン一覧の取得・ドメイン詳細・DNS レコード CRUD（A/AAAA/CNAME/MX/TXT/NS/ALIAS）・ドメイン購入（quote / start / direct / status）・支払い履歴・Personal Access Token (PAT) 管理を扱う。Bearer 認証のセットアップ、サンドボックス環境での検証、Next.js / Express / その他 Node 系バックエンドからの呼び出しの実装時に呼び出す。
---

# Muumuu Domain API v2 (MeAPI) Integration Skill

ムームードメイン API v2 を Web アプリケーションに統合するための実装ガイド。
公式ドキュメント: https://muumuu-domain.com/developers/openapi-me.html

## 環境とベース URL

| 環境 | Base URL | 用途 |
| --- | --- | --- |
| Sandbox | `https://api-sandbox.muumuu-domain.com/api/v2` | 検証・開発（本番DBから分離） |
| Production | `https://muumuu-domain.com/api/v2`（要確認） | 本番 |
| Local | `https://muu.test/api/v2` | Muumuu 内部ローカル |

実装では `MUUMUU_API_BASE_URL` のような環境変数で切り替えること。Sandbox を既定にしておくと安全。

## 認証

すべての MeAPI エンドポイントは `Authorization: Bearer <token>` ヘッダで認証する。トークンは以下の 2 種類：

- **Personal Access Token (PAT)**: `muu_pat_...` プレフィックス。サーバ側スクリプトや CI から呼ぶ場合の主流。Sandbox では `muu_pat_sandbox_...` が curl だけで自己発行できる。
- **OAuth2 access token**: ユーザーにアプリ連携させる場合。`domains:purchase` などのスコープを要求する。

### サンドボックス用 PAT の発行（Quickstart）

```bash
# 1. テストアカウント作成（muu_id と password を必ず保存。再発行不可）
curl -X POST https://api-sandbox.muumuu-domain.com/sandbox/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"partner@example.com"}'
# => { "data": { "muu_id": "xxxx", "password": "<password>" } }

# 2. PAT 発行（Basic 認証）
curl -X POST https://api-sandbox.muumuu-domain.com/sandbox/personal-access-tokens \
  -u '<muu_id>:<password>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-test","scopes":["domains:read","dns:write"],"expires_in":604800}'
# => { "data": { "token": "muu_pat_sandbox_xxx", ... } }

# 3. MeAPI 呼び出し
curl https://api-sandbox.muumuu-domain.com/api/v2/me/domains \
  -H 'Authorization: Bearer muu_pat_sandbox_xxx'
```

### Sandbox PAT の制約
- 許可スコープ: `domains:read`, `domains:search`, `dns:read`, `dns:write`
- `expires_in` 既定 7 日 / 最大 30 日（無期限不可）
- 1 muu_id あたり同時保持 20 件、24時間あたり新規発行 10 件
- `muu_pat_sandbox_` 接頭辞の PAT は本番環境では受け付けない

### 重要な認証方式の使い分け
- `Authorizations: jwt oauth2` 表記のエンドポイント: JWT（コントロールパネル）と OAuth/PAT の両方OK
- `Authorizations: jwt` のみ: JWT 専用（**PAT 不可**）。PAT 一覧/失効はこちら（自己増殖防止）。
- `Authorizations: oauth2` のみ: OAuth2 PAT 専用。ドメイン購入系（`domains:purchase` スコープ要）。
- `purchase-domain/direct` は `muu_pat_` プレフィックス & `domains:purchase` スコープ & 事前申請承認 必須。

## Web アプリ統合の基本パターン

### Node.js / TypeScript クライアント（最小実装）

`src/lib/muumuu.ts`:

```ts
const BASE_URL = process.env.MUUMUU_API_BASE_URL ?? "https://api-sandbox.muumuu-domain.com/api/v2";
const TOKEN = process.env.MUUMUU_API_TOKEN;

if (!TOKEN) throw new Error("MUUMUU_API_TOKEN is required");

type Query = Record<string, string | number | boolean | undefined>;

export class MuumuuError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number) {
    super(message);
  }
}

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function muumuuFetch<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: { query?: Query; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const retryAfter = res.headers.get("Retry-After");
    throw new MuumuuError(
      res.status,
      json?.error?.code ?? "unknown",
      json?.error?.message ?? res.statusText,
      retryAfter ? Number(retryAfter) : undefined,
    );
  }
  return json as T;
}
```

レスポンスは `{ "data": ... }`（場合により `meta`）でラップされる。エラーは `{ "error": { "code", "message" } }`。

## エンドポイント一覧

すべての MeAPI パスは認証ユーザー自身のリソースに限定される（`me` スコープ）。`{domain-id}` は `^MU[0-9]{8}$` 形式。

### Domains（ドメイン）

#### `GET /me/domains` — 保有ドメイン一覧
- Auth: jwt | oauth2
- Query: `page` (>=1, default 1), `page-size` (1..100, default 20), `fqdn` (完全一致), `state` (`active`|`inactive`|`pending-setup`|`pending-transfer`|`pending-bulk`)
- Response 200: `{ data: Domain[], meta: { total, page, page-size } }`

```ts
type Domain = {
  id: string;             // "MU00000001"
  sld: string;
  tld: string;
  fqdn: string;
  state: "active" | "inactive" | "pending-setup" | "pending-transfer" | "pending-bulk";
  "setup-state": string;
  registrar: string;
  "whois-proxy-enabled": boolean;
  "auto-renew-enabled": boolean;
  "is-japanese-domain": boolean;
  contract: { id: string; state: string; term: number; "start-date": string; "end-date": string };
};
export const listDomains = (q?: { page?: number; "page-size"?: number; fqdn?: string; state?: string }) =>
  muumuuFetch<{ data: Domain[]; meta: { total: number; page: number; "page-size": number } }>(
    "GET", "/me/domains", { query: q },
  );
```

#### `GET /me/domains/{domain-id}` — ドメイン詳細
- Auth: jwt | oauth2
- Path: `domain-id` (MU + 8桁)
- Response 200: `{ data: Domain }`、404 あり

### DNS Records（DNSレコード）

サポートタイプ: `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `NS`, `ALIAS`, `SRV`, `CAA`（SOA は除外）。

#### `GET /me/domains/{domain-id}/dns-records` — DNS レコード一覧
- Query: `type`, `fqdn`, `page`, `page-size`

#### `POST /me/domains/{domain-id}/dns-records` — 作成
- Body:
  ```ts
  type CreateDnsRecord = {
    fqdn: string;     // 末尾ドット付き例: "www.example.com."
    type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "ALIAS" | "SRV" | "CAA";
    value: string;    // 例: "192.0.2.1" / "mail.example.com." / "v=spf1 ..."
    ttl?: number;
    priority?: number; // MX のとき必須 (0..65535)
  };
  ```
- Constraints:
  - MX は `priority` 必須
  - CNAME は同一 FQDN に他レコード共存不可（RFC 1034）
  - ALIAS は他タイプと共存可
- Response 201: `{ data: DnsRecord }`、409（重複）、422（バリデーション）あり

```ts
type DnsRecord = {
  id: number;
  fqdn: string;
  type: CreateDnsRecord["type"];
  value: string;
  ttl: number;
  priority?: number;
  "created-at": string;
  "updated-at": string;
};
export const createDnsRecord = (domainId: string, body: CreateDnsRecord) =>
  muumuuFetch<{ data: DnsRecord }>("POST", `/me/domains/${domainId}/dns-records`, { body });
```

#### `PATCH /me/domains/{domain-id}/dns-records/{record-id}` — 部分更新
- 変更可: `value`, `ttl`, `priority`（MX）
- 変更不可: `fqdn`, `type`（変えたい場合は削除→再作成）

#### `DELETE /me/domains/{domain-id}/dns-records/{record-id}`
- 204 No Content。SOA は削除不可。

#### `GET /me/dns-records` — FQDN 指定で DNS 検索
- Query: `domain-fqdn` (必須, ドメインのFQDN), `type`, `fqdn`（レコードFQDN）, `page`, `page-size`
- domain-id が不明なときに FQDN から逆引きする用途。

### Domain Purchase（ドメイン購入：課金あり）

通常フロー: **quote → purchase → status ポーリング → checkout-url 完了**。

必ず購入実行前に quote API で金額・空き状況・カード登録状態をユーザーに提示し、明示的同意を得ること。

#### `POST /me/domain-purchase/quote` — 見積もり
- Auth: oauth2（`domains:purchase` スコープ）
- Body: `{ fqdn: string; term?: number /* 1..10, default 1 */ }`
- Response 200:
  ```json
  {
    "data": {
      "fqdn": "example.com",
      "availability": "available",
      "term": 1,
      "domain-price": 750,
      "service-fee": 158,
      "tax": 91,
      "total": 999,
      "currency": "JPY",
      "credit-card-registered": true,
      "credit-card-registration-url": null,
      "purchase-token": { "token": "tok_xxx", "expires-at": "..." }
    }
  }
  ```
- `purchase-token.token` の有効期限は **10 分**。
- カード未登録時は `credit-card-registration-url` が返るのでユーザーに案内。

#### `POST /me/domain-purchase` — 購入開始（ブラウザ確認フロー）
- Body: `{ "purchase-token": "tok_xxx" }`
- Response 201: `{ data: { "purchase-id", "checkout-url", "status": "pending", ... } }`
- ユーザーを `checkout-url` に遷移させ、購入確認を完了させる。`checkout-url` 有効期限 10 分。
- レート制限: **10件/日**

#### `POST /me/domain-purchase/direct` — 1リクエスト購入（事前申請制）
- **通常アカウントでは 403。利用申請が必要。**
- `muu_pat_` プレフィックスの PAT + `domains:purchase` スコープ必須。JWT/通常 OAuth は不可。
- 同一 `purchase-token` の再送は 409（リプレイ防止）。
- 504 が返った場合は同じトークンで即時リトライせず、必ず購入結果を確認してから対処。

#### `GET /me/domain-purchase/{purchase_id}/status` — 進捗ポーリング
- Auth: oauth2（`domains:purchase`）
- Path: `purchase_id` (integer)
- **推奨ポーリング間隔: 3〜5 秒**
- ステータス: `pending` → `processing` → `completed` / `failed`
- `completed` で `domain-id`, `contract-id` 確定。`failed` は `failure-reason` 参照。

```ts
async function pollPurchase(purchaseId: number, timeoutMs = 5 * 60_000): Promise<PurchaseStatus> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await muumuuFetch<{ data: PurchaseStatus }>(
      "GET", `/me/domain-purchase/${purchaseId}/status`,
    );
    if (data.status === "completed" || data.status === "failed") return data;
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("polling timeout");
}
```

### Personal Access Tokens

#### `GET /me/personal-access-tokens` — PAT 一覧
- Auth: **jwt のみ**（PAT 認証不可）
- Response: `{ data: [{ id, name, token-prefix, scopes, expires-at, last-used-at, status }] }`
- トークン本体は返さない。

#### `DELETE /me/personal-access-tokens/{id}` — PAT 失効
- Auth: **jwt のみ**
- 冪等（失効済みでも 204）
- 他アカウントの PAT は 404（IDOR 対策）

### Payment History（支払い履歴）

#### `GET /me/payment-history`
- Auth: jwt | oauth2
- Query: `page` (1..50), `page-size` (1..100), `date-from`, `date-to` (YYYY-MM-DD), `amount-min`, `amount-max`, `service-type`, `domain-name`
- `service-type` enum: `domain`, `google_workspace`, `wordpress`, `domain_lock`, `website_scan`, `ai_site_builder`, `muumuu_server`, `mail`, `auction`, `backorder`, `tmch`, `sunrise`, `land_rush`, `premium_domain`, `ssl`, `website_builder`, `ikazuchi_ms365`
- `domain-name` 指定時はオプション支払いを除外（ドメイン支払いのみ）
- Response: 支払い日降順。`amount-breakdown` に内訳（base-price/tax/surcharge/discount）。

## エラーハンドリング

共通エラー形式: `{ "error": { "code": "...", "message": "..." } }`

| Status | Code 例 | 対処 |
| --- | --- | --- |
| 400 | `bad_request` | パラメータ修正 |
| 401 | `unauthorized` / `invalid_token` | 再ログイン or PAT 再発行 |
| 402 | — | カード否認等（direct購入時） |
| 403 | `forbidden` / `insufficient_scope` / `context_mismatch` | スコープ不足・利用申請未承認 |
| 404 | — | リソース不在 |
| 409 | — | 重複（DNS の同一CNAME 等）、purchase-token 再送 |
| 422 | — | バリデーションエラー |
| 429 | — | レート制限。`Retry-After` ヘッダ秒数後に再試行 |
| 500/502/504 | — | サーバ側。504は購入系で即時リトライ禁止 |

## レート制限

- 認証済み: 1,000 req/h
- 未認証: 100 req/h
- `POST /me/domain-purchase`: 10 件/日
- `Retry-After` ヘッダに従い指数バックオフでリトライ。
- クライアント側でも 1 秒あたりリクエスト数を制御するか、上記の `MuumuuError.retryAfter` を見て `setTimeout` で待つ。

## Web アプリ組み込みのチェックリスト

1. **シークレット管理**: PAT は `.env` / シークレットストアで保管し、絶対にクライアントバンドルに含めない（漏洩リスク）。フロントから直接 MeAPI を叩かず、自前 API ルート（Next.js Route Handler / Express）経由でプロキシする。
2. **Sandbox 既定**: 開発中は Sandbox を既定にし、本番は環境変数で明示切替。Sandbox PAT が本番に流れないようガード。
3. **スコープ最小化**: PAT 発行時に必要スコープのみを付与（`domains:read` だけで済むなら書き込み権限を付けない）。
4. **冪等性**: DNS 作成・購入系は失敗時に再試行する前に状態取得 API でサーバ側状態を確認。`purchase-token` の二度送りは 409。
5. **購入フロー**: quote → 金額表示 → ユーザー同意 → purchase → checkout-url 遷移 → status ポーリング、を必ず守る。
6. **エラー UI**: 401/403 は再認証導線、429 は `Retry-After` を画面に出して自動リトライ、422 はフィールド単位エラー表示。
7. **タイムゾーン**: 日付フィールドは `+09:00` の ISO 8601。サーバ側は JST 想定。
8. **ページネーション**: 既定 20件 / 最大 100件。`meta.total` を見て次ページ取得。

## 実装の進め方（推奨ワークフロー）

1. ユーザーの目的（ドメイン一覧表示 / DNS設定UI / 購入フロー / 支払い履歴）をヒアリング。
2. 上の TypeScript クライアントを `src/lib/muumuu.ts` として導入し、`MUUMUU_API_BASE_URL` と `MUUMUU_API_TOKEN` を `.env` に追加（`.env.example` も用意し、`.gitignore` 確認）。
3. Sandbox の `signup` → `personal-access-tokens` で開発用 PAT を取得し `.env` に設定。
4. Next.js なら `app/api/muumuu/.../route.ts` で必要なエンドポイントを薄くプロキシし、フロントは自前 API のみ呼ぶ。
5. 主要エンドポイントを叩く E2E スモークテスト（`listDomains` 1件）で疎通確認。
6. 購入系を扱う場合は **必ず Sandbox** で quote→purchase→status の流れを通してから本番検討。`direct` は事前申請が通っているかを最初に確認。

## 参考

- 公式ドキュメント: https://muumuu-domain.com/developers/openapi-me.html
- Sandbox エンドポイント: `https://api-sandbox.muumuu-domain.com`
