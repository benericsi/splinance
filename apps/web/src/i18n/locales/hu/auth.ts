import type { en } from '../en';
import type { Messages } from '../../types';

export const auth: Messages<typeof en.auth> = {
  email: 'E-mail',
  emailPlaceholder: 'te@pelda.hu',
  password: 'Jelszó',
  login: {
    title: 'Bejelentkezés',
    description: 'Üdv újra a Splinance-ben.',
    noAccount: 'Még nincs fiókod? <a>Hozz létre egyet</a>',
    passwordPlaceholder: 'Add meg a jelszavad',
    submit: 'Bejelentkezés',
    submitLink: 'Bejelentkezés és összekapcsolás',
    submitting: 'Bejelentkezés…',
    deleted: 'A fiókodat töröltük. Köszönjük, hogy a Splinance-t használtad.',
    providerHint: '{{provider}}-fiókkal regisztráltál? Használd a fenti gombot.',
    tryDemo: 'Csak nézelődsz? <a>Próbáld ki a demót</a>',
  },
  register: {
    pageTitle: 'Regisztráció',
    title: 'Hozd létre a fiókod',
    description: 'Személyes és közös kiadások egy helyen.',
    haveAccount: 'Már van fiókod? <a>Jelentkezz be</a>',
    displayName: 'Megjelenített név',
    displayNamePlaceholder: 'pl. Anna',
    passwordPlaceholder: 'Adj meg egy jelszót',
    submit: 'Fiók létrehozása',
    submitting: 'Fiók létrehozása…',
    emailTaken: 'Ezzel az e-mail-címmel már van fiók',
    closed: 'Egyelőre csak meghívással lehet regisztrálni',
  },
  provider: {
    continueWith: 'Folytatás {{provider}}-fiókkal',
    orWithEmail: 'vagy e-maillel',
    linkTitle: 'Kapcsold össze a {{provider}}-fiókod',
    linkDescription:
      'Ehhez az e-mail-címhez már tartozik Splinance-fiók. Jelentkezz be egyszer a jelszavával, és összekapcsoljuk a {{provider}}-fiókkal.',
  },
  oauthError: {
    cancelled: 'A {{provider}}-bejelentkezést megszakítottad.',
    not_allowed: 'Egyelőre csak meghívással lehet regisztrálni.',
    email_unverified:
      'A {{provider}}-fiókod e-mail-címe nincs megerősítve. Erősítsd meg a {{provider}}-nél, vagy használj jelszót.',
    expired: 'A bejelentkezés túl sokáig tartott, vagy egy másik lapon indult. Próbáld újra.',
    conflict: 'Ez az e-mail-cím másik bejelentkezéshez tartozik. Lépj be a jelszavaddal.',
    unavailable:
      'A {{provider}}-bejelentkezés most nem érhető el. Használd a jelszavad, vagy próbáld később.',
    failed: 'A {{provider}}-bejelentkezés nem sikerült. Próbáld újra.',
    taken: 'Ezt a {{provider}}-fiókot már egy másik Splinance-fiók használja.',
    wrong_account: 'A {{provider}}-bejelentkezés nem sikerült. Próbáld újra.',
  },
};
