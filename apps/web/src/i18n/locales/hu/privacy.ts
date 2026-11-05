import type { en } from '../en';
import type { Messages } from '../../types';

/** Draft translation of the privacy notice; the controller reviews the legal wording. */
export const privacy: Messages<typeof en.privacy> = {
  pageTitle: 'Adatvédelem',
  title: 'Adatkezelési tájékoztató',
  intro:
    'Hogyan kezeli a Splinance a személyes adatokat, az EU általános adatvédelmi rendelete (GDPR) 13. cikke szerint.',
  inEffect: 'Hatályos: {{date}}',
  backToApp: 'Vissza a Splinance-be',
  logIn: 'Bejelentkezés',
  tableLabel: 'Adat, cél, jogalap és megőrzés',
  columns: { data: 'Adat', purpose: 'Cél', basis: 'Jogalap', kept: 'Megőrzés' },
  contract: 'Szerződés teljesítése (6. cikk (1) b))',
  legitimateInterest: 'Jogos érdek (6. cikk (1) f))',
  rows: {
    account: {
      data: 'Fiók: e-mail-cím, megjelenített név, jelszó-hash (Argon2id) vagy a Google-fiókod azonosítója',
      purpose: 'A fiókod és a bejelentkezés',
      kept: 'A fiók törléséig; a Google-fiók azonosítója addig, amíg a fiókbeállításokban le nem választod a Google-t',
    },
    household: {
      data: 'Háztartási adatok: tagok és szerepek, tranzakciók, megosztások, kifizetések, kategóriák, szabályok, keretek, szerkesztési előzmények',
      purpose: 'Maga a szolgáltatás',
      kept: 'Amíg a háztartás létezik; a közös tételek kilépésed után is megmaradnak a többi tagnak, mert az egyenlegük függ tőlük',
    },
    imports: {
      data: 'Banki importok: az importált sorok és a fájl neve',
      purpose: 'Tranzakciók hozzáadása',
      kept: 'Mint a háztartási adatok; magát a fájlt soha nem tároljuk',
    },
    sessions: {
      data: 'Munkamenetek: eszközönként egy hashelt token',
      purpose: 'Bejelentkezve tartás',
      kept: 'Az utolsó használat után 30 napig',
    },
    invites: {
      data: 'Meghívólinkek: egy hashelt token',
      purpose: 'Csatlakozás egy háztartáshoz',
      kept: '7 napig',
    },
    logs: {
      data: 'Kérésnaplók: a tárhelyszolgáltató feljegyzései minden kérésről (IP-cím, kért cím, időpont); a saját naplóink nem tartalmaznak tokent és IP-címet',
      purpose: 'Biztonság, visszaélések korlátozása, hibajavítás',
      kept: 'A csomagunkban 7 napig láthatók; a Railway tovább is megőrizheti őket',
    },
    backups: {
      data: 'Mentések: az adatbázis munkamenetek nélkül, titkosítva',
      purpose: 'Helyreállítás hiba után',
      kept: 'Napi mentések 35 napig, havi mentések 13 hónapig',
    },
  },
  s1: {
    title: '1. Ki az adatkezelő',
    body: 'Bene Richárd, magánszemély, Magyarország, <a>{{email}}</a>. A Splinance személyes projekt, csak meghívással használható és ingyenes; nem áll mögötte vállalkozás.',
  },
  s2: {
    title: '2. Mit, miért, milyen jogalapon, meddig',
    body: 'A háztartás többi tagja látja a megjelenített neved, a szereped és a közös tételeket, az e-mail-címed soha. A privát tételeket csak te látod.',
  },
  s3: {
    title: '3. Bejelentkezés Google-fiókkal',
    body: 'Ha ezt választod, a Google elküldi nekünk a Google-fiókod azonosítóját, az e-mail-címed, azt, hogy a Google megerősítette-e, és a neved. Az azonosítót megőrizzük, hogy felismerjünk; új fiók esetén az e-mail-címet és a nevet használjuk. A profilképed, a névjegyeid és a Google-tokenjeid nem kapjuk meg, és a Google-fiókodban nem tudunk műveletet végezni. A Google önálló adatkezelőként jár el, és tudomást szerez arról, hogy bejelentkeztél a Splinance-be.',
  },
  s4: {
    title: '4. Kik kezelnek adatot a megbízásunkból',
    railway:
      'Railway: tárhely és adatbázis, az EU West régióban (Amszterdam). A Railway amerikai cég; az adattovábbítást az adatfeldolgozási kiegészítőjében szereplő uniós általános szerződési feltételek fedik le.',
    aws: 'Amazon Web Services: a titkosított mentések, Frankfurtban. A visszafejtéshez szükséges kulcs csak az adatkezelőnél van.',
    cloudflare: 'Cloudflare: csak a domain DNS-e, személyes adat nélkül.',
    nothingSold:
      'Semmit nem adunk el, nem osztunk meg hirdetési célra, és nem használunk mesterségesintelligencia-modellek tanítására.',
  },
  s5: {
    title: '5. Sütik és tárolás',
    body: 'Csak ami a bejelentkezéshez kell: a munkamenet-süti (30 nap) és Google-bejelentkezés közben két rövid életű süti (10 perc). A böngésződ ezen felül megjegyzi a témát, a nyelvet, az utoljára megnyitott háztartást és az importhoz választott bankot. Nincs analitika, nincs követés, nincsenek külső betűtípusok vagy szkriptek, ezért nincs süti-értesítő sem.',
  },
  s6: {
    title: '6. Biztonság',
    body: 'Mindenhol HTTPS, Argon2id-vel hashelt jelszavak, a lehető legkevesebb joggal rendelkező adatbázis-szerepek, és a szerverről csak titkosítva távozó mentések.',
  },
  s7: {
    title: '7. Automatizált döntéshozatal',
    body: 'Nincs, és profilalkotás sincs. A kategóriaszabályok csak azt teszik, amire beállítod őket.',
  },
  s8: {
    title: '8. A jogaid',
    body: 'A fiókodat magad is törölheted a Fiókbeállításokban: a bejelentkezési adataid, a neved, az e-mail-címed és a privát tranzakcióid azonnal törlődnek, és azok a háztartások is, amelyekben rajtad kívül soha senki nem volt. A közös tételek a többi tagnál megmaradnak, mert az egyenlegükhöz szükségesek, „Volt tag” néven, téged azonosító adat nélkül. Kérheted továbbá az adataidhoz való hozzáférést, helyesbítésüket vagy törlésüket, a kezelés korlátozását, hordozható formátumú másolatot, és tiltakozhatsz a jogos érdeken alapuló adatkezelés ellen. Írj a fenti e-mail-címre; a kérésekre egy hónapon belül válaszolunk. A törölt adatok a mentések lejártával tűnnek el azokból is.',
    complaint:
      'Panaszt tehetsz a Nemzeti Adatvédelmi és Információszabadság Hatóságnál (NAIH, 1055 Budapest, Falk Miksa utca 9-11, ugyfelszolgalat@naih.hu, naih.hu), vagy bírósághoz fordulhatsz.',
  },
  s9: {
    title: '9. Egyéb',
    body: 'A Splinance 16 éves kortól használható. A tájékoztató változásai ezen az oldalon jelennek meg, új dátummal.',
  },
};
