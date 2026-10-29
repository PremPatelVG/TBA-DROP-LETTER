// Unit tests for the advisor welcome email builder and the (non-throwing) delivery wrapper. Pure functions only
// (no SMTP, no nodemailer, no browser): run with `npm run test:unit`. Node strips the TypeScript types on import.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildRegionalWelcomeEmail, buildWelcomeEmail, DEFAULT_MAIL_FROM, sendMail } from "../../src/lib/email.ts";

const FIELDS = {
  name: "Asha Patel",
  advisorId: "ADV004",
  email: "asha.patel@example.com",
  password: "advisor-pass-1",
  apkUrl: "https://app.tbaindia.in/tba-advisor.apk",
  appUrl: "https://portal.example.in",
};

/** The envelope + body, assembled the way createAdvisor / the demo do. */
const message = (fields = FIELDS) => ({ from: DEFAULT_MAIL_FROM, to: fields.email, ...buildWelcomeEmail(fields) });

describe("buildWelcomeEmail: the advisor welcome email", () => {
  test("the From is indiaops@tbaindia.in and the To is the advisor's email (their username)", () => {
    const m = message();
    assert.equal(DEFAULT_MAIL_FROM, "indiaops@tbaindia.in");
    assert.equal(m.from, "indiaops@tbaindia.in");
    assert.equal(m.to, "asha.patel@example.com");
  });

  test("the subject welcomes them and mentions the login and the app download", () => {
    const { subject } = buildWelcomeEmail(FIELDS);
    assert.match(subject, /welcome/i);
    assert.match(subject, /login/i);
    assert.match(subject, /download/i);
  });

  test("the plain-text body carries the username, the password, the Advisor ID and the download link", () => {
    const { text } = buildWelcomeEmail(FIELDS);
    assert.ok(text.includes("asha.patel@example.com"), "username (email)");
    assert.ok(text.includes("advisor-pass-1"), "initial password");
    assert.ok(text.includes("ADV004"), "Advisor ID");
    assert.ok(text.includes("https://app.tbaindia.in/tba-advisor.apk"), "APK download link");
    assert.ok(text.includes("Asha Patel"), "advisor name");
    assert.match(text, /on your phone/i, "the install-on-your-phone instruction");
  });

  test("the HTML body carries the same details, with the link as a real href", () => {
    const { html } = buildWelcomeEmail(FIELDS);
    assert.ok(html.includes("asha.patel@example.com"), "username (email)");
    assert.ok(html.includes("advisor-pass-1"), "initial password");
    assert.ok(html.includes("ADV004"), "Advisor ID");
    assert.ok(html.includes('href="https://app.tbaindia.in/tba-advisor.apk"'), "APK link as an href");
  });

  test("HTML-unsafe characters in the inputs are escaped (no HTML injection)", () => {
    const { html } = buildWelcomeEmail({ ...FIELDS, name: 'A<b> & "x"', password: "p<a>&ss'" });
    assert.ok(!html.includes("<b>"), "the raw tag must not survive");
    assert.ok(html.includes("A&lt;b&gt; &amp; &quot;x&quot;"), "name is escaped");
    assert.ok(html.includes("p&lt;a&gt;&amp;ss&#39;"), "password is escaped");
  });
});

describe("buildWelcomeEmail: portal link and iPhone note (no app stores)", () => {
  test("the advisor email also carries the web portal link and tells iPhone users to use the website", () => {
    const { text, html } = buildWelcomeEmail(FIELDS);
    assert.ok(text.includes("https://portal.example.in"));
    assert.ok(html.includes('href="https://portal.example.in"'));
    assert.match(text, /iPhone/);
    assert.match(text, /allow installing apps from this source/i);
  });
});

const REGIONAL = {
  name: "Kiran Shah",
  title: "Gujarat President",
  email: "kiran.shah@gmail.com",
  password: "Temp-Pass-42",
  apkUrl: "https://app.tbaindia.in/tba-advisor.apk",
  appUrl: "https://portal.example.in",
};

describe("buildRegionalWelcomeEmail: the regional-account (President / TBA India Ops) welcome email", () => {
  test("text and HTML carry name, title, username, temporary password, portal link and APK link", () => {
    const { subject, text, html } = buildRegionalWelcomeEmail(REGIONAL);
    assert.match(subject, /welcome/i);
    assert.ok(subject.includes("Gujarat President"));
    for (const body of [text, html]) {
      assert.ok(body.includes("Kiran Shah"), "name");
      assert.ok(body.includes("Gujarat President"), "role title");
      assert.ok(body.includes("kiran.shah@gmail.com"), "username");
      assert.ok(body.includes("Temp-Pass-42"), "temporary password");
      assert.ok(body.includes("https://portal.example.in"), "portal link");
      assert.ok(body.includes("https://app.tbaindia.in/tba-advisor.apk"), "APK link");
    }
    assert.ok(html.includes('href="https://portal.example.in"') && html.includes('href="https://app.tbaindia.in/tba-advisor.apk"'), "links are hrefs");
    assert.match(text, /Sign in with Google/);
    assert.match(text, /iPhone/);
    assert.match(text, /allow installing apps from this source/i);
    assert.doesNotMatch(text, /Advisor ID/, "no advisor fields");
  });

  test("works for TBA India Ops too", () => {
    const { subject, text } = buildRegionalWelcomeEmail({ ...REGIONAL, title: "TBA India Ops" });
    assert.ok(subject.includes("TBA India Ops") && text.includes("as TBA India Ops."));
  });

  test("no secrets beyond the temporary password: no SMTP credentials, env names or tokens", () => {
    process.env.SMTP_PASS = "smtp-secret-xyz";
    try {
      const { subject, text, html } = buildRegionalWelcomeEmail(REGIONAL);
      const all = subject + text + html;
      assert.ok(!all.includes("smtp-secret-xyz"));
      assert.doesNotMatch(all, /SMTP|APP_APK_URL|APP_URL|api[_ ]?key|token/i);
      // The only password-like value present is the one passed in.
      assert.equal(text.split("Temp-Pass-42").length - 1, 1, "the password appears once in the text body");
    } finally {
      delete process.env.SMTP_PASS;
    }
  });

  test("HTML-unsafe input is escaped", () => {
    const { html } = buildRegionalWelcomeEmail({ ...REGIONAL, name: "<script>x</script>", title: 'A&"B' });
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;") && html.includes("A&amp;&quot;B"));
  });
});

describe("sendMail: delivery is non-fatal (so a mail problem never fails advisor creation)", () => {
  test("a working transport reports success and receives the exact message", async () => {
    let received = null;
    const sender = { sendMail: async (m) => { received = m; return { messageId: "1" }; } };
    const m = message();
    const result = await sendMail(sender, m);
    assert.deepEqual(result, { ok: true });
    assert.equal(received, m, "the message is passed straight through to the transport");
  });

  test("a transport that throws does NOT throw out of sendMail — it is reported as a failure", async () => {
    const sender = { sendMail: async () => { throw new Error("ECONNREFUSED smtp.example:587"); } };
    const result = await sendMail(sender, message());
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.reason.includes("ECONNREFUSED"), "the reason explains the failure");
    // No throw reaching here is the point: createAdvisor awaits this and still returns the created advisor.
  });

  test("a transport that rejects is also handled without throwing", async () => {
    const sender = { sendMail: () => Promise.reject(new Error("535 auth failed")) };
    const result = await sendMail(sender, message());
    assert.equal(result.ok, false);
  });
});
