import type { Unit, GameState, CombatLogEntry, SynergyEffect } from './types';
import { HEROES, HERO_IDS } from './heroes';

export { HEROES, HERO_IDS };

// Board dimensions
export const BOARD_COLS = 7;
export const BOARD_ROWS = 4;
export const CELL_SIZE = 92;

// Enemy zone: rows 0-1, Player zone: rows 2-3
export const ENEMY_ROWS = [0, 1];
export const PLAYER_ROWS = [2, 3];

// Game constants
export const MOVE_INTERVAL = 420; // ms per move tick
export const SYNERGY_TICK = 3000; // priest heal every 3s
export const MANA_PER_TICK = 5; // mana gained per attack

// Enemy positions (fixed enemy lineup)
export const ENEMY_POSITIONS: Record<string, [number, number]> = {
  varian: [1, 0],
  antonidas: [3, 0],
  tyrande: [5, 0],
  boval: [2, 1],
  khadgar: [4, 1],
};

// Initialize enemy units from fixed positions
export function createEnemyUnits(): Unit[] {
  return HERO_IDS
    .filter((id) => ['varian', 'antonidas', 'tyrande', 'boval', 'khadgar'].includes(id))
    .map((id) => {
      const config = HEROES[id];
      const [col, row] = ENEMY_POSITIONS[id];
      return createUnit(config, col, row, 'enemy');
    });
}

export function createUnit(
  config: typeof HEROES[string],
  col: number,
  row: number,
  team: 'player' | 'enemy'
): Unit {
  return {
    id: `${team}-${config.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    config,
    hp: config.maxHp,
    maxHp: config.maxHp,
    mana: 0,
    x: col,
    y: row,
    team,
    attackCooldown: 0,
    skillCooldown: 0,
    shield: 0,
    shieldDuration: 0,
    stunDuration: 0,
    attackBuff: 0,
    attackBuffDuration: 0,
    isDead: false,
    deathTime: 0,
  };
}

// Calculate synergy effects for a team
export function calculateSynergies(units: Unit[]): Map<string, SynergyEffect> {
  const synergies = new Map<string, SynergyEffect>();

  const countClass = (team: Unit['team'], heroClass: Unit['config']['class']) =>
    units.filter((u) => !u.isDead && u.team === team && u.config.class === heroClass).length;

  // Warrior synergies
  const playerWarriors = countClass('player', 'warrior');
  if (playerWarriors >= 2) {
    synergies.set('warrior', {
      name: '战士',
      count: playerWarriors,
      bonus: '+200 HP / +20 护甲',
      active: true,
    });
    if (playerWarriors >= 4) {
      synergies.get('warrior')!.bonus = '+700 HP / +60 护甲';
      synergies.get('warrior')!.count = playerWarriors;
    }
  }

  const enemyWarriors = countClass('enemy', 'warrior');
  if (enemyWarriors >= 2) {
    synergies.set('enemy-warrior', {
      name: '敌方战士',
      count: enemyWarriors,
      bonus: '+200 HP / +20 护甲',
      active: true,
    });
    if (enemyWarriors >= 4) {
      synergies.get('enemy-warrior')!.bonus = '+700 HP / +60 护甲';
      synergies.get('enemy-warrior')!.count = enemyWarriors;
    }
  }

  // Mage synergies
  const playerMages = countClass('player', 'mage');
  if (playerMages >= 2) {
    synergies.set('mage', {
      name: '法师',
      count: playerMages,
      bonus: '+30% 法术强度',
      active: true,
    });
    if (playerMages >= 4) {
      synergies.set('mage', {
        name: '法师',
        count: playerMages,
        bonus: '+100% 法术强度',
        active: true,
      });
    }
  }

  const enemyMages = countClass('enemy', 'mage');
  if (enemyMages >= 2) {
    synergies.set('enemy-mage', {
      name: '敌方法师',
      count: enemyMages,
      bonus: '+30% 法术强度',
      active: true,
    });
    if (enemyMages >= 4) {
      synergies.set('enemy-mage', {
        name: '敌方法师',
        count: enemyMages,
        bonus: '+100% 法术强度',
        active: true,
      });
    }
  }

  // Priest synergies
  const playerPriests = countClass('player', 'priest');
  if (playerPriests >= 2) {
    synergies.set('priest', {
      name: '牧师',
      count: playerPriests,
      bonus: '每3秒回复50 HP',
      active: true,
    });
    if (playerPriests >= 4) {
      synergies.set('priest', {
        name: '牧师',
        count: playerPriests,
        bonus: '每3秒回复200 HP',
        active: true,
      });
    }
  }

  const enemyPriests = countClass('enemy', 'priest');
  if (enemyPriests >= 2) {
    synergies.set('enemy-priest', {
      name: '敌方牧师',
      count: enemyPriests,
      bonus: '每3秒回复50 HP',
      active: true,
    });
    if (enemyPriests >= 4) {
      synergies.set('enemy-priest', {
        name: '敌方牧师',
        count: enemyPriests,
        bonus: '每3秒回复200 HP',
        active: true,
      });
    }
  }

  return synergies;
}

// Get synergy bonuses for a unit
export function getSynergyBonus(
  unit: Unit,
  units: Unit[]
): { hpBonus: number; armorBonus: number; spellPowerBonus: number; priestHeal: number } {
  const synergies = calculateSynergies(units);
  const _team = unit.team;

  let hpBonus = 0;
  let armorBonus = 0;
  let spellPowerBonus = 0;
  let priestHeal = 0;

  const classKey = unit.config.class; // 'warrior' | 'mage' | 'priest'
  const synergy = synergies.get(classKey);
  if (synergy && (classKey === 'warrior' || classKey === 'mage' || classKey === 'priest')) {
    if (classKey === 'warrior') {
      if (synergy.count >= 4) {
        hpBonus = 700;
        armorBonus = 60;
      } else if (synergy.count >= 2) {
        hpBonus = 200;
        armorBonus = 20;
      }
    } else if (classKey === 'mage') {
      if (synergy.count >= 4) {
        spellPowerBonus = 1.0;
      } else if (synergy.count >= 2) {
        spellPowerBonus = 0.3;
      }
    } else if (classKey === 'priest') {
      if (synergy.count >= 4) {
        priestHeal = 200;
      } else if (synergy.count >= 2) {
        priestHeal = 50;
      }
    }
  }

  return { hpBonus, armorBonus, spellPowerBonus, priestHeal };
}

// Chebyshev distance
export function chebyshevDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

// Find nearest enemy
export function findNearestEnemy(unit: Unit, units: Unit[]): Unit | null {
  let nearest: Unit | null = null;
  let minDist = Infinity;
  for (const other of units) {
    if (other.isDead || other.team === unit.team) continue;
    const dist = chebyshevDistance(unit.x, unit.y, other.x, other.y);
    if (dist < minDist) {
      minDist = dist;
      nearest = other;
    }
  }
  return nearest;
}

// Find all allies in range (for buffs)
export function findAlliesInRange(unit: Unit, units: Unit[], range: number): Unit[] {
  return units.filter(
    (other) =>
      !other.isDead &&
      other.team === unit.team &&
      other.id !== unit.id &&
      chebyshevDistance(unit.x, unit.y, other.x, other.y) <= range
  );
}

// Calculate physical damage
export function calculateDamage(
  attacker: Unit,
  defender: Unit,
  bonusMultiplier: number = 1
): number {
  const synergy = getSynergyBonus(attacker, []);
  const attackWithBuff = attacker.config.attack * (1 + synergy.spellPowerBonus + attacker.attackBuff);
  const rawDamage = attackWithBuff * bonusMultiplier;
  const armorReduction = defender.config.armor * 0.45;
  return Math.max(1, Math.floor(rawDamage - armorReduction));
}

// Calculate spell damage (affected by spell power)
export function calculateSpellDamage(
  baseDamage: number,
  caster: Unit,
  units: Unit[]
): number {
  const synergy = getSynergyBonus(caster, units);
  const spellPower = 1 + synergy.spellPowerBonus;
  return Math.floor(baseDamage * spellPower);
}

// Move unit one step toward target
export function moveToward(unit: Unit, target: Unit, allUnits: Unit[]): void {
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;

  if (dx === 0 && dy === 0) return;

  // Try to move in the direction of greater distance first
  const moves: Array<[number, number]> = [];

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx > 0) moves.push([1, 0]);
    else if (dx < 0) moves.push([-1, 0]);
    if (dy > 0) moves.push([0, 1]);
    else if (dy < 0) moves.push([0, -1]);
  } else {
    if (dy > 0) moves.push([0, 1]);
    else if (dy < 0) moves.push([0, -1]);
    if (dx > 0) moves.push([1, 0]);
    else if (dx < 0) moves.push([-1, 0]);
  }

  // Try each move
  for (const [mx, my] of moves) {
    const newX = unit.x + mx;
    const newY = unit.y + my;
    if (newX < 0 || newX >= BOARD_COLS || newY < 0 || newY >= BOARD_ROWS) continue;
    // Check if cell is occupied
    const occupied = allUnits.some(
      (u) => !u.isDead && u.x === newX && u.y === newY
    );
    if (!occupied) {
      unit.x = newX;
      unit.y = newY;
      return;
    }
  }
}

// Auto-fill player units into available positions
export function autoFillPlayerUnits(units: Unit[]): Unit[] {
  const usedPositions = new Set(
    units.filter((u) => !u.isDead && u.team === 'player').map((u) => `${u.x},${u.y}`)
  );

  const availablePositions: [number, number][] = [];
  for (let row = 2; row <= 3; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      if (!usedPositions.has(`${col},${row}`)) {
        availablePositions.push([col, row]);
      }
    }
  }

  // Shuffle available hero IDs
  const shuffledIds = [...HERO_IDS].sort(() => Math.random() - 0.5);

  const newUnits: Unit[] = [...units];
  let posIdx = 0;

  for (const id of shuffledIds) {
    // Skip if already on board
    if (units.some((u) => !u.isDead && u.team === 'player' && u.config.id === id)) continue;
    if (posIdx >= availablePositions.length) break;

    const [col, row] = availablePositions[posIdx++];
    const config = HEROES[id];
    const unit = createUnit(config, col, row, 'player');
    newUnits.push(unit);
  }

  return newUnits;
}

// Reset player units for new battle
export function resetUnits(units: Unit[]): Unit[] {
  return units.map((u) => ({
    ...u,
    hp: u.config.maxHp,
    maxHp: u.config.maxHp,
    mana: 0,
    attackCooldown: 0,
    skillCooldown: 0,
    shield: 0,
    shieldDuration: 0,
    stunDuration: 0,
    attackBuff: 0,
    attackBuffDuration: 0,
    isDead: false,
    deathTime: 0,
  }));
}

// Check if player team is ready (has at least 1 unit)
export function isPlayerTeamReady(units: Unit[]): boolean {
  return units.some((u) => !u.isDead && u.team === 'player');
}

// Check win condition
export function checkWinCondition(units: Unit[]): 'player' | 'enemy' | null {
  const playerAlive = units.some((u) => !u.isDead && u.team === 'player');
  const enemyAlive = units.some((u) => !u.isDead && u.team === 'enemy');

  if (!playerAlive) return 'enemy';
  if (!enemyAlive) return 'player';
  return null;
}

// Use skill for a unit
export function useSkill(
  unit: Unit,
  units: Unit[],
  log: CombatLogEntry[]
): CombatLogEntry[] {
  const newLog = [...log];
  const skill = unit.config.skill;

  switch (skill.type) {
    case 'buff': {
      // Warrior buff: 战吼 - 周围2格友军+35%攻击5秒
      const allies = findAlliesInRange(unit, units, 2);
      for (const ally of allies) {
        ally.attackBuff = 0.35;
        ally.attackBuffDuration = 5000;
      }
      newLog.push({
        time: Date.now(),
        message: `${unit.config.name} 施放【${skill.name}】为 ${allies.length} 个友军增加35%攻击力！`,
        type: 'buff',
      });
      break;
    }
    case 'damage': {
      const id = unit.config.id;
      if (id === 'jaina') {
        // 暴风雪 - 全屏160冰霜伤害
        const dmg = calculateSpellDamage(160, unit, units);
        for (const target of units) {
          if (target.isDead || target.team === unit.team) continue;
          const actualDmg = dealDamageTo(target, dmg, units, newLog);
          newLog.push({
            time: Date.now(),
            message: `${unit.config.name} 的【${skill.name}】对 ${target.config.name} 造成 ${actualDmg} 冰霜伤害！`,
            type: 'damage',
          });
        }
      } else if (id === 'khadgar') {
        // 奥术飞弹 - 5枚飞弹每枚90伤害(随机目标)
        const aliveEnemies = units.filter((u) => !u.isDead && u.team !== unit.team);
        for (let i = 0; i < 5; i++) {
          if (aliveEnemies.length === 0) break;
          const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
          const dmg = calculateSpellDamage(90, unit, units);
          const actualDmg = dealDamageTo(target, dmg, units, newLog);
          newLog.push({
            time: Date.now(),
            message: `${unit.config.name} 的【${skill.name}】对 ${target.config.name} 造成 ${actualDmg} 奥术伤害！`,
            type: 'damage',
          });
        }
      } else if (id === 'antonidas') {
        // 火焰爆破 - 420火焰伤害
        const target = findNearestEnemy(unit, units);
        if (target) {
          const dmg = calculateSpellDamage(420, unit, units);
          const actualDmg = dealDamageTo(target, dmg, units, newLog);
          newLog.push({
            time: Date.now(),
            message: `${unit.config.name} 的【${skill.name}】对 ${target.config.name} 造成 ${actualDmg} 火焰伤害！`,
            type: 'damage',
          });
        }
      } else if (id === 'varian') {
        // 碎裂 - 320%物理伤害
        const target = findNearestEnemy(unit, units);
        if (target) {
          const dmg = calculateDamage(unit, target, 3.2);
          const actualDmg = dealDamageTo(target, dmg, units, newLog);
          newLog.push({
            time: Date.now(),
            message: `${unit.config.name} 的【${skill.name}】对 ${target.config.name} 造成 ${actualDmg} 物理伤害！`,
            type: 'damage',
          });
        }
      }
      break;
    }
    case 'heal': {
      if (unit.config.id === 'anduin') {
        // 圣光术 - 最低血量友军回复210
        const allies = units.filter((u) => !u.isDead && u.team === unit.team);
        const lowest = allies.reduce<Unit | null>((low, u) =>
          !low || u.hp / u.maxHp < low.hp / low.maxHp ? u : low
        , null);
        if (lowest) {
          const healAmount = 210;
          lowest.hp = Math.min(lowest.maxHp, lowest.hp + healAmount);
          newLog.push({
            time: Date.now(),
            message: `${unit.config.name} 的【${skill.name}】为 ${lowest.config.name} 回复 ${healAmount} HP！`,
            type: 'heal',
          });
        }
      } else if (unit.config.id === 'verena') {
        // 祈愿 - 所有友军回复130
        const healAmount = 130;
        for (const ally of units) {
          if (ally.isDead || ally.team !== unit.team) continue;
          ally.hp = Math.min(ally.maxHp, ally.hp + healAmount);
        }
        newLog.push({
          time: Date.now(),
          message: `${unit.config.name} 的【${skill.name}】为所有友军回复 ${healAmount} HP！`,
          type: 'heal',
        });
      }
      break;
    }
    case 'cc': {
      // 月之箭 - 220伤害+1.5秒眩晕
      if (unit.config.id === 'tyrande') {
        const target = findNearestEnemy(unit, units);
        if (target) {
          const dmg = calculateSpellDamage(220, unit, units);
          const actualDmg = dealDamageTo(target, dmg, units, newLog);
          target.stunDuration = 1500;
          newLog.push({
            time: Date.now(),
            message: `${unit.config.name} 的【${skill.name}】对 ${target.config.name} 造成 ${actualDmg} 伤害并眩晕1.5秒！`,
            type: 'stun',
          });
        }
      }
      break;
    }
    case 'shield': {
      // 神圣护盾 - 3秒免疫护盾，格挡一次
      if (unit.config.id === 'boval') {
        unit.shield = 9999; // essentially full shield
        unit.shieldDuration = 3000;
        newLog.push({
          time: Date.now(),
          message: `${unit.config.name} 施放【${skill.name}】，获得3秒免疫护盾！`,
          type: 'shield',
        });
      }
      break;
    }
  }

  unit.mana = 0;
  return newLog;
}

// Deal damage to a unit
export function dealDamageTo(
  target: Unit,
  damage: number,
  units: Unit[],
  log: CombatLogEntry[]
): number {
  let actualDamage = damage;

  // Check shield (block first attack)
  if (target.shield > 0 && target.shieldDuration > 0) {
    log.push({
      time: Date.now(),
      message: `${target.config.name} 的护盾格挡了攻击！`,
      type: 'block',
    });
    target.shield = 0;
    target.shieldDuration = 0;
    return 0;
  }

  target.hp -= actualDamage;

  if (target.hp <= 0) {
    target.hp = 0;
    target.isDead = true;
    target.deathTime = Date.now();
    log.push({
      time: Date.now(),
      message: `${target.config.name} 阵亡了！`,
      type: 'death',
    });
  }

  return actualDamage;
}

// Process one game tick
export function processTick(
  state: GameState,
  deltaMs: number,
  log: CombatLogEntry[]
): { newState: GameState; newLog: CombatLogEntry[] } {
  if (state.phase !== 'battle') return { newState: state, newLog: log };

  let newLog = [...log];
  const newUnits = state.units.map((u) => ({ ...u }));

  // Update battle time
  const newBattleTime = state.battleTime + deltaMs;

  // Process priest heals every 3 seconds
  if (Math.floor(newBattleTime / SYNERGY_TICK) > Math.floor(state.battleTime / SYNERGY_TICK)) {
    for (const unit of newUnits) {
      if (unit.isDead) continue;
      const priestHeal = getSynergyBonus(unit, newUnits).priestHeal;
      if (priestHeal > 0) {
        unit.hp = Math.min(unit.maxHp, unit.hp + priestHeal);
        if (unit.team === 'player') {
          newLog.push({
            time: Date.now(),
            message: `牧师协同：${unit.config.name} 回复 ${priestHeal} HP`,
            type: 'heal',
          });
        }
      }
    }
  }

  // Update unit cooldowns and durations
  for (const unit of newUnits) {
    if (unit.isDead) continue;

    // Update durations
    if (unit.stunDuration > 0) {
      unit.stunDuration -= deltaMs;
      if (unit.stunDuration < 0) unit.stunDuration = 0;
    }
    if (unit.shieldDuration > 0) {
      unit.shieldDuration -= deltaMs;
      if (unit.shieldDuration < 0) unit.shieldDuration = 0;
    }
    if (unit.attackBuffDuration > 0) {
      unit.attackBuffDuration -= deltaMs;
      if (unit.attackBuffDuration < 0) {
        unit.attackBuffDuration = 0;
        unit.attackBuff = 0;
      }
    }

    // Skip if stunned
    if (unit.stunDuration > 0) continue;

    // Update cooldowns
    unit.attackCooldown -= deltaMs;
    unit.skillCooldown -= deltaMs;
    if (unit.skillCooldown < 0) unit.skillCooldown = 0;

    // Check skill (优先释放技能)
    if (unit.mana >= unit.config.skill.manaCost && unit.skillCooldown <= 0) {
      newLog = useSkill(unit, newUnits, newLog);
      unit.skillCooldown = 5000; // 5s skill cooldown
      continue; // After using skill, skip attack this tick
    }

    // Attack or move
    const target = findNearestEnemy(unit, newUnits);
    if (!target) continue;

    const dist = chebyshevDistance(unit.x, unit.y, target.x, target.y);

    if (dist <= unit.config.range) {
      // In range - attack
      if (unit.attackCooldown <= 0) {
        const dmg = calculateDamage(unit, target);
        const actualDmg = dealDamageTo(target, dmg, newUnits, newLog);
        unit.mana = Math.min(unit.config.maxMana, unit.mana + MANA_PER_TICK);
        unit.attackCooldown = unit.config.attackSpeed;

        if (actualDmg > 0) {
          newLog.push({
            time: Date.now(),
            message: `${unit.config.name} 攻击 ${target.config.name}，造成 ${actualDmg} 伤害`,
            type: 'damage',
          });
        }
      }
    } else {
      // Move toward target
      moveToward(unit, target, newUnits);
    }
  }

  // Check win condition
  const winner = checkWinCondition(newUnits);
  const newPhase = winner ? 'ended' : 'battle';

  return {
    newState: {
      units: newUnits,
      phase: newPhase,
      winner,
      battleTime: newBattleTime,
    },
    newLog,
  };
}
