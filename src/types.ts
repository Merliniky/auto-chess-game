export type HeroClass = 'warrior' | 'mage' | 'priest';

export interface HeroConfig {
  id: string;
  name: string;
  title: string;
  class: HeroClass;
  maxHp: number;
  attack: number;
  attackSpeed: number; // ms
  range: number; // 1 = melee, 4 = ranged
  armor: number;
  skill: SkillConfig;
  mana: number;
  maxMana: number;
  color: string;
}

export interface SkillConfig {
  name: string;
  manaCost: number;
  description: string;
  type: 'buff' | 'damage' | 'heal' | 'cc' | 'shield';
}

export interface Unit {
  id: string;
  config: HeroConfig;
  hp: number;
  maxHp: number;
  mana: number;
  x: number;
  y: number;
  team: 'player' | 'enemy';
  attackCooldown: number;
  skillCooldown: number;
  shield: number;
  shieldDuration: number;
  stunDuration: number;
  attackBuff: number; // bonus attack %
  attackBuffDuration: number;
  isDead: boolean;
  deathTime: number;
}

export interface GameState {
  units: Unit[];
  phase: 'setup' | 'battle' | 'ended';
  winner: 'player' | 'enemy' | null;
  battleTime: number;
}

export interface CombatLogEntry {
  time: number;
  message: string;
  type: 'damage' | 'heal' | 'skill' | 'death' | 'block' | 'stun' | 'shield' | 'buff';
}

export interface SynergyEffect {
  name: string;
  count: number;
  bonus: string;
  active: boolean;
}
