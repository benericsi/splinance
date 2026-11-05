import type { en } from '../en';
import type { Messages } from '../../types';

export const account: Messages<typeof en.account> = {
  title: 'Fiókbeállítások',
  description: 'A profilod és a bejelentkezési módjaid.',
  profile: {
    editName: 'Név módosítása',
    displayName: 'Megjelenített név',
    displayNamePlaceholder: 'Anna',
    emailNote: 'Az e-mail-címeddel jelentkezel be. Egyelőre nem módosítható.',
    nameChanged: 'Név módosítva',
  },
  language: {
    title: 'Nyelv',
    description: 'Minden eszközön ezt látod, ahol bejelentkezel.',
  },
  methods: {
    title: 'Bejelentkezési módok',
    description: 'Így léphetsz be a Splinance-be. Legalább egy maradjon.',
    password: 'Jelszó',
    set: 'Beállítva',
    notSet: 'Nincs beállítva',
    change: 'Módosítás',
    setPassword: 'Jelszó beállítása',
    connected: 'Összekapcsolva: {{connected}} · Utoljára használva: {{lastUsed}}',
    notConnected: 'Nincs összekapcsolva',
    onlyWayIn:
      'Csak így tudsz belépni. Előbb állíts be jelszót, utána leválaszthatod a {{provider}}-fiókot.',
    connect: 'Összekapcsolás',
    connectTitle: 'Összekapcsolod a {{provider}}-fiókod?',
    connectWithPassword:
      'Erősítsd meg, hogy te vagy az, majd válaszd ki a fiókod a {{provider}}-nél. Utána bármelyikkel beléphetsz.',
    connectWithoutPassword: 'Válaszd ki a fiókod a {{provider}}-nél. Utána azzal is beléphetsz.',
    continueTo: 'Tovább: {{provider}}',
    opening: 'Megnyitás…',
    disconnect: 'Leválasztás',
    disconnectTitle: 'Leválasztod a {{provider}}-fiókod?',
    disconnectDescription:
      'Ezután nem tudsz {{provider}}-fiókkal belépni. A többi eszközön kijelentkeztetünk, itt bejelentkezve maradsz.',
    disconnecting: 'Leválasztás…',
    disconnected: 'A {{provider}}-fiókot leválasztottuk. A többi eszközön kijelentkeztettünk.',
    nowConnected:
      'A {{provider}}-fiók összekapcsolva. Legközelebb a {{provider}}-fiókkal is beléphetsz.',
    theProvider: 'a szolgáltató',
  },
  devices: {
    title: 'Más eszközök',
    description: 'Kijelentkezés mindenhol, kivéve itt. Legfeljebb 15 percen belül érvényes.',
    signOut: 'Kijelentkezés más eszközökön',
    signingOut: 'Kijelentkezés…',
    none: 'Más eszközön nem voltál bejelentkezve',
    signedOut_one: '{{count}} másik eszközön kijelentkeztettünk',
    signedOut_other: '{{count}} másik eszközön kijelentkeztettünk',
  },
  danger: {
    title: 'Veszélyzóna',
    deleteAccount: 'Fiók törlése',
    deleteDescription:
      'A bejelentkezésed és a privát adataid törlődnek. A közös tételek megmaradnak a többieknek, Volt tag néven.',
    deleteButton: 'Fiók törlése…',
  },
  password: {
    changeTitle: 'Jelszó módosítása',
    setTitle: 'Jelszó beállítása',
    changeDescription: 'A többi eszközön kijelentkeztetünk. Itt bejelentkezve maradsz.',
    setDescription:
      'Utána a(z) {{email}} címmel is beléphetsz. A többi eszközön kijelentkeztetünk.',
    reauth:
      'A biztonságod érdekében előbb erősítsd meg, hogy te vagy az. Utána rögtön visszajössz ide.',
    new: 'Új jelszó',
    newPlaceholder: 'Adj meg egy jelszót',
    change: 'Jelszó módosítása',
    changing: 'Módosítás…',
    set: 'Jelszó beállítása',
    setting: 'Beállítás…',
    changed: 'Jelszó módosítva. A többi eszközön kijelentkeztettünk.',
    setDone: 'Jelszó beállítva. Mostantól az e-mail-címeddel is beléphetsz.',
  },
  delete: {
    title: 'Törlöd a fiókod?',
    blocked: 'Előbb rendezd ezeket, aztán gyere vissza.',
    final: 'Ez nem vonható vissza.',
    openBalance:
      '<strong>{{household}}: nyitott egyenleg.</strong> <a>Számoljatok el</a>, hogy senkinek ne maradjon tartozása.',
    onlyOwner:
      '<strong>{{household}}: te vagy az egyetlen tulajdonos.</strong> Előbb <a>tegyél meg mást is tulajdonosnak</a>.',
    leaves:
      'Kilépsz innen: <strong>{{household}}</strong>. A közös tételeid ott maradnak, Volt tag néven.',
    deletes: '<strong>{{household}}</strong> törlődik (rajtad kívül soha senki nem volt benne).',
    archives: '<strong>{{household}}</strong> archiválódik (mindenki más kilépett).',
    private_one: '{{count}} privát tranzakció törlődik.',
    private_other: '{{count}} privát tranzakció törlődik.',
    backups:
      'A titkosított mentések legfeljebb 13 hónapig őrzik az adatokat, utána végleg eltűnnek.',
    typeEmail: 'Megerősítéshez írd be: {{email}}',
    emailMismatch: 'Pontosan úgy írd be az e-mail-címed, ahogy látod',
    submit: 'Fiókom törlése',
    submitting: 'Törlés…',
  },
  oauthError: {
    cancelled: 'Megszakítottad a {{provider}}-nél. Semmi nem változott.',
    taken: 'Ezt a {{provider}}-fiókot már egy másik Splinance-fiók használja.',
    conflict: 'Már egy másik {{provider}}-fiók van összekapcsolva. Előbb azt válaszd le.',
    wrong_account:
      'Ez nem az a {{provider}}-fiók, amelyik itt össze van kapcsolva. Próbáld újra azzal.',
    email_unverified:
      'A {{provider}}-fiókod e-mail-címe nincs megerősítve. Előbb erősítsd meg a {{provider}}-nél.',
    expired: 'Ez túl sokáig tartott, vagy egy másik lapon indult. Próbáld újra.',
    unavailable: 'A {{provider}} most nem érhető el. Próbáld később.',
    failed: 'Ez nem sikerült a {{provider}}-nél. Próbáld újra.',
  },
};
