import cash from '@tabler/icons/outline/cash.svg?raw';
import trendingUp from '@tabler/icons/outline/trending-up.svg?raw';
import moon from '@tabler/icons/outline/moon.svg?raw';
import store from '@tabler/icons/outline/building-store.svg?raw';
import www from '@tabler/icons/outline/world-www.svg?raw';
import pin from '@tabler/icons/outline/map-pin.svg?raw';
import flag from '@tabler/icons/outline/flag.svg?raw';
import device from '@tabler/icons/outline/device-mobile.svg?raw';
import repeat from '@tabler/icons/outline/repeat.svg?raw';
import user from '@tabler/icons/outline/user.svg?raw';
import lockX from '@tabler/icons/outline/lock-x.svg?raw';
import scan from '@tabler/icons/outline/scan.svg?raw';
import pause from '@tabler/icons/outline/player-pause.svg?raw';
import play from '@tabler/icons/outline/player-play.svg?raw';
import upload from '@tabler/icons/outline/upload.svg?raw';
import download from '@tabler/icons/outline/download.svg?raw';
import fileText from '@tabler/icons/outline/file-text.svg?raw';
import check from '@tabler/icons/outline/check.svg?raw';
import x from '@tabler/icons/outline/x.svg?raw';
import arrowRight from '@tabler/icons/outline/arrow-right.svg?raw';
import arrowUpRight from '@tabler/icons/outline/arrow-up-right.svg?raw';
import mail from '@tabler/icons/outline/mail.svg?raw';
import sparkles from '@tabler/icons/outline/sparkles.svg?raw';
import alert from '@tabler/icons/outline/alert-triangle.svg?raw';
import eye from '@tabler/icons/outline/eye.svg?raw';
import chartDots from '@tabler/icons/outline/chart-dots.svg?raw';
import external from '@tabler/icons/outline/external-link.svg?raw';
import shieldCheck from '@tabler/icons/outline/shield-check.svg?raw';
import creditCard from '@tabler/icons/outline/credit-card.svg?raw';
import robot from '@tabler/icons/outline/robot.svg?raw';
import userX from '@tabler/icons/outline/user-x.svg?raw';
import copy from '@tabler/icons/outline/copy.svg?raw';
import point from '@tabler/icons/outline/point.svg?raw';

const MAP = {
  cash, 'trending-up': trendingUp, moon, 'building-store': store, 'world-www': www, 'map-pin': pin,
  flag, 'device-mobile': device, repeat, user, 'lock-x': lockX, scan, 'player-pause': pause,
  'player-play': play, upload, download, 'file-text': fileText, check, x, 'arrow-right': arrowRight,
  'arrow-up-right': arrowUpRight, mail, sparkles, 'alert-triangle': alert, eye, 'chart-dots': chartDots,
  'external-link': external, 'shield-check': shieldCheck, 'credit-card': creditCard, robot, 'user-x': userX,
  copy, point,
};

export const icon = (name) => (MAP[name] || MAP.point).replace('<svg', '<svg aria-hidden="true" focusable="false"');

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.dataset.iconDone) { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); el.dataset.iconDone = '1'; }
  });
}
