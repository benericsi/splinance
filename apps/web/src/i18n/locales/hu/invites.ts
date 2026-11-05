import type { en } from '../en';
import type { Messages } from '../../types';

export const invites: Messages<typeof en.invites> = {
  dialogTitle: 'Meghívás ide: {{household}}',
  dialogDescription: 'Akinél a link van, egyszer csatlakozhat vele. 7 napig érvényes.',
  create: 'Meghívólink létrehozása',
  createAnother: 'Újabb link létrehozása',
  creating: 'Létrehozás…',
  pending: 'Függő meghívók',
  loading: 'Betöltés…',
  none: 'Nincs függő meghívó.',
  by: 'Küldte: {{name}}, lejár: {{expires}}',
  revokeLabel: '{{name}} meghívójának visszavonása, lejár: {{expires}}',
  revoke: 'Visszavonás',
  revoked: 'Meghívó visszavonva',
  qr: 'QR-kód a meghívóhoz: {{household}}',
  link: 'Meghívólink',
  copy: 'Másolás',
  copied: 'Másolva',
  copyFailed: 'Nem sikerült másolni. Jelöld ki a linket, és másold ki.',
  shownOnce: 'Ez a link csak most látszik. Küldd el, vagy olvassák be a kódot.',
  page: {
    pageTitle: 'Csatlakozás egy háztartáshoz',
    incompleteTitle: 'Ez a meghívólink hiányos',
    incompleteDescription: 'Nyisd meg a teljes linket, amit kaptál, vagy kérj újat.',
    openingTitle: 'A meghívó megnyitása',
    openingDescription: 'Egy pillanat.',
    joinTitle: 'Csatlakozás: {{household}}',
    joinDescription:
      '{{inviter}} meghívott, hogy közösen vezessétek a kiadásokat itt: {{household}}. A meghívó lejár: {{expires}}.',
    logInToJoin: 'Jelentkezz be a csatlakozáshoz',
    createAccount: 'Fiók létrehozása',
    alreadyMember: 'Már tagja vagy ennek: {{household}}.',
    openApp: 'A Splinance megnyitása',
    goToApp: 'Tovább a Splinance-hez',
    join: 'Csatlakozás: {{household}}',
    joining: 'Csatlakozás…',
    welcome: 'Üdv itt: {{household}}',
    joiningAs: 'Így csatlakozol: {{name}}.',
    notYou: 'Nem te vagy? Kijelentkezés',
  },
  problems: {
    INVITE_NOT_FOUND: {
      title: 'Ez a meghívólink nem működik',
      description: 'Lehet, hogy hiányos, vagy a háztartást archiválták. Kérj új linket.',
    },
    INVITE_EXPIRED: {
      title: 'Ez a meghívó lejárt',
      description: 'A meghívólinkek 7 napig érvényesek. Kérj újat.',
    },
    INVITE_USED: {
      title: 'Ezt a meghívót már felhasználták',
      description: 'Minden link egyszer működik. Kérj újat.',
    },
    INVITE_REVOKED: {
      title: 'Ezt a meghívót visszavonták',
      description: 'A háztartás tulajdonosa visszavonta. Kérj új linket.',
    },
    other: {
      title: 'Valami hiba történt',
      description: 'A meghívót nem sikerült betölteni. Próbáld újra egy kicsit később.',
    },
  },
};
