// Google sign-in (required) and profile, shared with Gopinath's other apps: see kolam-design-system/auth.
import { KolamAuth } from 'https://tgopinath.github.io/kolam-design-system/auth/kolam-auth.js'
// Where the profile button sits in this app's header
document.head.insertAdjacentHTML('beforeend', `<style>@media (max-width:760px){.top-inner .ka-avatar{order:3;width:44px;height:44px}.top-inner:has(.ka-avatar) .search{flex:1 1 0;min-width:0}}</style>`)

KolamAuth.init({
  app: 'zoorassicpark', appName: 'Zoorassic Park', icon: 'icon-192.png',
  tagline: 'A grown-up signs in once, and your favourite animals and best scores are saved for next time.',
  fields: [
    { key: 'childName', label: "Child's name", placeholder: 'e.g. Aadhya' },
    { key: 'ageGroup', label: 'Age group', type: 'select', options: [['2-4', '2 to 4 years'], ['5-7', '5 to 7 years'], ['8-10', '8 to 10 years'], ['11+', '11 and older']] },
    { key: 'lang', label: 'Language', type: 'select', options: [['en', 'English'], ['ta', 'தமிழ்']] },
  ],
  avatarSlot: '.top-inner',
  sync: ['ap.faves', 'ap.lang', 'ap.memory.best'],
})
