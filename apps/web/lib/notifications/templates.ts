/** Bildirim e-postaları (saf; ADR 0018). Türkçe, düz metin + sade HTML, her birinde çıkış bağlantısı. */
import type { MyCampaignDto } from "@kartplan/shared";
import { formatKurus } from "@kartplan/shared";

import { daysBetween } from "@/lib/campaign-match";
import { JOIN_METHOD_LABELS } from "@/lib/campaign-labels";
import type { UnsubscribeTarget } from "@/lib/notifications/unsubscribe";

export type Email = {
  subject: string;
  text: string;
  html: string;
  /** Bu e-postanın kapatılabilir türü (List-Unsubscribe). */
  unsubscribe: UnsubscribeTarget;
};

export type Links = {
  /** Uygulamanın kök adresi (https://...). */
  base: string;
  unsubscribe: (target: UnsubscribeTarget) => string;
};

export type WeeklySummary = {
  monthLabel: string;
  totalKurus: number;
  baselineKurus: number;
  rows: { category: string; card: string; amountKurus: number }[];
  toJoin: { id: string; title: string }[];
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const dayFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const formatDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));

function layout(
  title: string,
  bodyHtml: string,
  bodyText: string,
  target: UnsubscribeTarget,
  links: Links,
) {
  const off = links.unsubscribe(target);
  const allOff = links.unsubscribe("all");
  const footerText =
    `\n—\nBu e-postayı KartPlan hesabındaki kartların ve kampanyaların için alıyorsun.\n` +
    `Bu bildirimleri kapat: ${off}\nTüm bildirimleri kapat: ${allOff}\n`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#171717">
  <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
  ${bodyHtml}
  <p style="color:#666;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:12px">
    Bu e-postayı KartPlan hesabındaki kartların ve kampanyaların için alıyorsun.
    <a href="${escapeHtml(off)}" style="color:#666">Bu bildirimleri kapat</a> ·
    <a href="${escapeHtml(allOff)}" style="color:#666">Tüm bildirimleri kapat</a>
  </p>
</div>`;
  return { html, text: `${title}\n\n${bodyText}${footerText}` };
}

const campaignUrl = (links: Links, id: string) => `${links.base}/kampanyalarim/${id}`;

function campaignList(
  campaigns: MyCampaignDto[],
  links: Links,
  line: (campaign: MyCampaignDto) => string,
) {
  const html = `<ul style="padding-left:18px">${campaigns
    .map(
      (c) =>
        `<li style="margin-bottom:8px"><a href="${escapeHtml(campaignUrl(links, c.id))}">${escapeHtml(c.title)}</a><br><span style="color:#555;font-size:13px">${escapeHtml(line(c))}</span></li>`,
    )
    .join("")}</ul>`;
  const text = campaigns
    .map((c) => `• ${c.title}\n  ${line(c)}\n  ${campaignUrl(links, c.id)}`)
    .join("\n");
  return { html, text };
}

export function joinReminderEmail(campaigns: MyCampaignDto[], links: Links): Email {
  const [first] = campaigns;
  const subject =
    campaigns.length === 1 && first
      ? `"${first.title}" başladı: katılmayı unutma`
      : `${campaigns.length} kampanya başladı: katılmayı unutma`;
  const list = campaignList(campaigns, links, (c) =>
    [
      `${c.bankName} · ${JOIN_METHOD_LABELS[c.joinMethod]} katılım`,
      c.joinDeadline ? `son gün ${formatDay(c.joinDeadline)}` : `${formatDay(c.endsAt)}'e kadar`,
    ].join(" · "),
  );
  const intro =
    "Kartlarına uyan bu kampanyalar katılım istiyor. Katılmadan yaptığın harcamalar sayılmayabilir. Katıldıktan sonra uygulamada “Katıldım” olarak işaretle.";
  const body = layout(
    "Katılmayı unutma",
    `<p>${escapeHtml(intro)}</p>${list.html}`,
    `${intro}\n\n${list.text}`,
    "joinReminder",
    links,
  );
  return { subject, ...body, unsubscribe: "joinReminder" };
}

export function endingSoonEmail(campaigns: MyCampaignDto[], today: string, links: Links): Email {
  const left = (c: MyCampaignDto) => daysBetween(today, c.endsAt);
  const when = (c: MyCampaignDto) =>
    left(c) === 1 ? "bugün bitiyor" : `${left(c)} gün kaldı (${formatDay(c.endsAt)})`;
  const [first] = campaigns;
  const subject =
    campaigns.length === 1 && first
      ? `"${first.title}": ${when(first)}`
      : `${campaigns.length} kampanyan bitmek üzere`;
  const list = campaignList(campaigns, links, (c) => `${c.bankName} · ${when(c)}`);
  const intro =
    "Katıldığın ya da planındaki bu kampanyalar bitmek üzere. Gereksiz harcamaya teşvik etmeyiz: zaten yapacağın bir harcama varsa bu kartla yapmayı unutma.";
  const body = layout(
    "Kampanyaların bitmek üzere",
    `<p>${escapeHtml(intro)}</p>${list.html}`,
    `${intro}\n\n${list.text}`,
    "endingSoon",
    links,
  );
  return { subject, ...body, unsubscribe: "endingSoon" };
}

export function weeklySummaryEmail(summary: WeeklySummary, links: Links): Email {
  const gain = summary.totalKurus - summary.baselineKurus;
  const subject = `Bu haftanın planı: ${formatKurus(summary.totalKurus)} beklenen kazanç`;
  const rowsHtml = summary.rows
    .map(
      (row) =>
        `<tr><td style="padding:4px 8px">${escapeHtml(row.category)}</td><td style="padding:4px 8px">${escapeHtml(row.card)}</td><td style="padding:4px 8px;text-align:right">${formatKurus(row.amountKurus)}</td></tr>`,
    )
    .join("");
  const rowsText = summary.rows
    .map((row) => `• ${row.category}: ${row.card} (${formatKurus(row.amountKurus)})`)
    .join("\n");
  const joinHtml = summary.toJoin.length
    ? `<p><strong>Katılman gerekenler:</strong></p><ul>${summary.toJoin
        .map(
          (c) =>
            `<li><a href="${escapeHtml(campaignUrl(links, c.id))}">${escapeHtml(c.title)}</a></li>`,
        )
        .join("")}</ul>`
    : "";
  const joinText = summary.toJoin.length
    ? `\n\nKatılman gerekenler:\n${summary.toJoin.map((c) => `• ${c.title} ${campaignUrl(links, c.id)}`).join("\n")}`
    : "";
  const totals = `${summary.monthLabel} için beklenen kazanç ${formatKurus(summary.totalKurus)}${
    gain > 0 ? `; tek kartla ödesen ${formatKurus(gain)} daha az kazanırdın` : ""
  }.`;
  const plan = `${links.base}/plan`;
  const body = layout(
    "Bu haftanın planı",
    `<p>${escapeHtml(totals)}</p><table style="border-collapse:collapse;font-size:14px">${rowsHtml}</table>${joinHtml}<p><a href="${escapeHtml(plan)}">Planın tamamı</a></p>`,
    `${totals}\n\n${rowsText}${joinText}\n\nPlanın tamamı: ${plan}`,
    "weeklySummary",
    links,
  );
  return { subject, ...body, unsubscribe: "weeklySummary" };
}

export type MonthlyReportSummary = {
  month: string; // "2026-11"
  monthLabel: string;
  campaignEarnedKurus: number;
  baseEarnedKurus: number;
  earned: { id: string; title: string; earnedKurus: number }[];
  missed: { id: string; title: string; rewardKurus: number; note: string }[];
};

export function monthlyReportEmail(summary: MonthlyReportSummary, links: Links): Email {
  const earnedTotal = summary.campaignEarnedKurus + summary.baseEarnedKurus;
  const missedTotal = summary.missed.reduce((sum, item) => sum + item.rewardKurus, 0);
  const subject = `${summary.monthLabel} raporun: ~${formatKurus(earnedTotal)} kazandın`;
  const totals =
    `${summary.monthLabel} boyunca kampanyalardan ~${formatKurus(summary.campaignEarnedKurus)}, ` +
    `kart puanından ~${formatKurus(summary.baseEarnedKurus)} kazandın` +
    (missedTotal > 0 ? `; ~${formatKurus(missedTotal)} kaçırdın.` : ".");
  const list = (items: { id: string; title: string; line: string }[]) => ({
    html: `<ul style="padding-left:18px">${items
      .map(
        (item) =>
          `<li style="margin-bottom:6px"><a href="${escapeHtml(campaignUrl(links, item.id))}">${escapeHtml(item.title)}</a> <span style="color:#555;font-size:13px">${escapeHtml(item.line)}</span></li>`,
      )
      .join("")}</ul>`,
    text: items.map((item) => `• ${item.title} ${item.line}`).join("\n"),
  });
  const earned = list(
    summary.earned
      .slice(0, 5)
      .map((item) => ({ ...item, line: `~${formatKurus(item.earnedKurus)}` })),
  );
  const missed = list(
    summary.missed
      .slice(0, 5)
      .map((item) => ({ ...item, line: `~${formatKurus(item.rewardKurus)} · ${item.note}` })),
  );
  const report = `${links.base}/plan/rapor?ay=${summary.month}`;
  const body = layout(
    `${summary.monthLabel} raporun`,
    `<p>${escapeHtml(totals)}</p>` +
      (summary.earned.length ? `<p><strong>Kazandıkların</strong></p>${earned.html}` : "") +
      (summary.missed.length ? `<p><strong>Kaçırdıkların</strong></p>${missed.html}` : "") +
      `<p><a href="${escapeHtml(report)}">Raporun tamamı</a></p>` +
      `<p style="color:#666;font-size:12px">Tutarlar girdiğin harcamalardan tahmindir; kesin tutarlar bankanın ekstresindedir.</p>`,
    `${totals}` +
      (summary.earned.length ? `\n\nKazandıkların:\n${earned.text}` : "") +
      (summary.missed.length ? `\n\nKaçırdıkların:\n${missed.text}` : "") +
      `\n\nRaporun tamamı: ${report}\nTutarlar girdiğin harcamalardan tahmindir.`,
    "monthlyReport",
    links,
  );
  return { subject, ...body, unsubscribe: "monthlyReport" };
}
