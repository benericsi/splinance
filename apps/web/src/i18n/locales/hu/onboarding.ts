import type { en } from '../en';
import type { Messages } from '../../types';

export const onboarding: Messages<typeof en.onboarding> = {
  step: '{{step}}. lépés / {{steps}}',
  back: 'Vissza',
  continue: 'Tovább',
  welcome: {
    title: 'Üdv, {{name}}',
    description:
      'A Splinance igazságosan tartja a közös kiadásokat. Minden egy háztartásban történik.',
    create: 'Háztartás létrehozása',
    createDescription: 'Neked és azoknak, akikkel közösen fizettek.',
    join: 'Csatlakozás meghívólinkkel',
    joinDescription: 'Valaki már meghívott.',
  },
  household: {
    title: 'Nevezd el a háztartásod',
    description: 'Olyat válassz, amit mindenki felismer. Később átnevezheted.',
  },
  invite: {
    title: 'Hívd meg a párod',
    description:
      'Küldj neki linket, vagy olvassa be a kódot. Ezt később a beállításokban is megteheted.',
    skip: 'Most kihagyom',
    owner: 'Te vagy a tulajdonos',
  },
  done: {
    title: '{{household}} kész',
    description: 'Jöhetnek a közös kiadások és az egyenlegek. Itt tartasz most.',
    created: 'Háztartás létrehozva',
    invited: 'Meghívó elküldve, a csatlakozásra vár',
    notInvited: 'A beállításokban bármikor meghívhatsz valakit',
    goTo: 'Tovább ide: {{household}}',
  },
  join: {
    title: 'Csatlakozás meghívólinkkel',
    description: 'Illeszd be a linket, amit kaptál. Csatlakozás előtt látod a háztartást.',
    link: 'Meghívólink',
    required: 'Illeszd be a kapott meghívólinket',
    invalid: 'Ez nem meghívólinknek tűnik',
  },
};
