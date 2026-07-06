import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host:   process.env.MAIL_HOST ?? 'smtp.gmail.com',
  port:   Number(process.env.MAIL_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

interface ReportMailData {
  toEmail:          string;
  userName:         string;
  vehicleName:      string;
  date:             string;
  distanceTotaleKm: number;
  vitesseMoyenne:   number;
  vitesseMax:       number;
  nbAlarmes:        number;
  tempsArretMinutes: number;
}

export const sendReportEmail = async (data: ReportMailData): Promise<void> => {
  const {
    toEmail, userName, vehicleName, date,
    distanceTotaleKm, vitesseMoyenne, vitesseMax,
    nbAlarmes, tempsArretMinutes,
  } = data;

  const heuresArret  = Math.floor(tempsArretMinutes / 60);
  const minutesArret = tempsArretMinutes % 60;
  const arretLabel   = heuresArret > 0
    ? `${heuresArret}h ${minutesArret}min`
    : `${minutesArret} min`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: Arial, sans-serif; background: #f8faf9; margin: 0; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 24px; max-width: 480px; margin: 0 auto; border-top: 4px solid #007A3D; }
    .logo { font-size: 22px; font-weight: 700; color: #007A3D; letter-spacing: 2px; }
    .title { font-size: 18px; font-weight: 600; color: #111827; margin: 16px 0 4px; }
    .subtitle { font-size: 13px; color: #6b7280; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
    .stat { background: #f8faf9; border-radius: 8px; padding: 14px; text-align: center; }
    .stat-value { font-size: 22px; font-weight: 700; color: #007A3D; }
    .stat-label { font-size: 11px; color: #6b7280; margin-top: 4px; text-transform: uppercase; }
    .alarm-row { background: #FEE2E2; border-radius: 8px; padding: 12px; margin: 8px 0; display: flex; align-items: center; gap: 8px; }
    .alarm-text { font-size: 13px; color: #B91C1C; font-weight: 600; }
    .footer { font-size: 11px; color: #9ca3af; text-align: center; margin-top: 20px; }
    .flag { display: flex; height: 3px; border-radius: 2px; overflow: hidden; margin-bottom: 16px; }
    .f1 { flex: 1; background: #007A3D; }
    .f2 { flex: 1; background: #CE1126; }
    .f3 { flex: 1; background: #FCD116; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🦅 FAUCON</div>
    <div class="flag"><div class="f1"></div><div class="f2"></div><div class="f3"></div></div>

    <div class="title">Rapport journalier — ${vehicleName}</div>
    <div class="subtitle">Bonjour ${userName}, voici le résumé du ${date}</div>

    <div class="grid">
      <div class="stat">
        <div class="stat-value">${distanceTotaleKm} km</div>
        <div class="stat-label">Distance totale</div>
      </div>
      <div class="stat">
        <div class="stat-value">${vitesseMoyenne} km/h</div>
        <div class="stat-label">Vitesse moyenne</div>
      </div>
      <div class="stat">
        <div class="stat-value">${vitesseMax} km/h</div>
        <div class="stat-label">Vitesse max</div>
      </div>
      <div class="stat">
        <div class="stat-value">${arretLabel}</div>
        <div class="stat-label">Temps d'arrêt</div>
      </div>
    </div>

    ${nbAlarmes > 0 ? `
    <div class="alarm-row">
      <span style="font-size:18px">⚠️</span>
      <div class="alarm-text">${nbAlarmes} alarme(s) déclenchée(s) aujourd'hui</div>
    </div>
    ` : `
    <div style="background:#E8F5EE;border-radius:8px;padding:12px;text-align:center;color:#007A3D;font-size:13px;font-weight:600;">
      ✅ Aucune alarme aujourd'hui
    </div>
    `}

    <div class="footer">
      Rapport généré automatiquement par FAUCON Tracking<br/>
      Voir le détail dans l'application mobile
    </div>
  </div>
</body>
</html>
  `;

  await transporter.sendMail({
    from:    `"FAUCON Tracking" <${process.env.MAIL_USER}>`,
    to:      toEmail,
    subject: `🦅 Rapport FAUCON — ${vehicleName} — ${date}`,
    html,
  });

  console.log(`[MAIL] Rapport envoyé à ${toEmail} pour ${vehicleName}`);
};