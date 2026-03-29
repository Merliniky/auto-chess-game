import { useState, useCallback, useRef, useEffect } from 'react';
import type { Unit, GameState, CombatLogEntry } from './types';
import {
  HEROES,
  HERO_IDS,
  createUnit,
  createEnemyUnits,
  autoFillPlayerUnits,
  calculateSynergies,
  getSynergyBonus,
  BOARD_COLS,
  BOARD_ROWS,
  CELL_SIZE,
  MOVE_INTERVAL,
  isPlayerTeamReady,
  processTick,
} from './gameEngine';
import './App.css';

// Helper to create initial state
function createInitialState(): GameState {
  return {
    units: [],
    phase: 'setup',
    winner: null,
    battleTime: 0,
  };
}

function App() {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  const [combatLog, setCombatLog] = useState<CombatLogEntry[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<
    Array<{ id: string; x: number; y: number; text: string; type: string; time: number }>
  >([]);
  const logRef = useRef<HTMLDivElement>(null);
  const battleLoopRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  useState({});

  // Keep last battle time for continuity
  const battleTimeRef = useRef(0);

  // Compute synergies
  const playerSynergies = calculateSynergies(gameState.units.filter((u) => u.team === 'player'));
  const enemySynergies = calculateSynergies(gameState.units.filter((u) => u.team === 'enemy'));

  const activePlayerSynergies = Array.from(playerSynergies.values()).filter((s) => s.active);
  const activeEnemySynergies = Array.from(enemySynergies.values()).filter((s) => s.active);

  // Get player units
  const _playerUnits = gameState.units.filter((u) => u.team === 'player');
  const _enemyUnits = gameState.units.filter((u) => u.team === 'enemy');

  // Add floating text
  // Handle clicking on board cell
  const handleBoardClick = useCallback(
    (col: number, row: number) => {
      if (gameState.phase !== 'setup') return;
      if (row < 2) return; // Only player zone

      // Remove any existing unit at this position
      const existingIdx = gameState.units.findIndex(
        (u) => !u.isDead && u.team === 'player' && u.x === col && u.y === row
      );

      if (selectedHeroId) {
        // Place selected hero
        const config = HEROES[selectedHeroId];
        // Check if hero already on board
        const alreadyOnBoard = gameState.units.some(
          (u) => !u.isDead && u.team === 'player' && u.config.id === selectedHeroId
        );
        if (alreadyOnBoard) {
          setSelectedHeroId(null);
          return;
        }

        let newUnits: Unit[];
        if (existingIdx >= 0) {
          // Replace existing
          newUnits = gameState.units.map((u, i) =>
            i === existingIdx
              ? createUnit(config, col, row, 'player')
              : u
          );
        } else {
          newUnits = [
            ...gameState.units,
            createUnit(config, col, row, 'player'),
          ];
        }

        setGameState((prev) => ({ ...prev, units: newUnits }));
        setSelectedHeroId(null);
      } else if (existingIdx >= 0) {
        // Click on existing unit to remove
        const newUnits = gameState.units.filter((_, i) => i !== existingIdx);
        setGameState((prev) => ({ ...prev, units: newUnits }));
      }
    },
    [gameState.phase, gameState.units, selectedHeroId]
  );

  // Auto fill
  const handleAutoFill = useCallback(() => {
    if (gameState.phase !== 'setup') return;
    let units = gameState.units.filter((u) => u.team === 'enemy');
    const newUnits = autoFillPlayerUnits(units);
    setGameState((prev) => ({ ...prev, units: newUnits }));
  }, [gameState]);

  // Reset
  const handleReset = useCallback(() => {
    if (battleLoopRef.current) {
      cancelAnimationFrame(battleLoopRef.current);
      battleLoopRef.current = null;
    }
    setGameState(createInitialState());
    setCombatLog([]);
    setFloatingTexts([]);
    battleTimeRef.current = 0;
  }, []);

  // Start battle
  const handleStartBattle = useCallback(() => {
    if (!isPlayerTeamReady(gameState.units)) return;

    const allUnits = [
      ...gameState.units.filter((u) => u.team === 'player'),
      ...createEnemyUnits(),
    ];

    // Apply synergy bonuses to maxHp
    const unitsWithSynergy = allUnits.map((u) => {
      const bonus = getSynergyBonus(u, allUnits);
      const hpBonus = bonus.hpBonus;
      const newMaxHp = u.config.maxHp + hpBonus;
      return {
        ...u,
        maxHp: newMaxHp,
        hp: newMaxHp,
      };
    });

    const newLog: CombatLogEntry[] = [
      {
        time: Date.now(),
        message: '⚔️ 战斗开始！',
        type: 'skill',
      },
    ];

    setGameState({
      units: unitsWithSynergy,
      phase: 'battle',
      winner: null,
      battleTime: 0,
    });
    setCombatLog(newLog);
    battleTimeRef.current = 0;
    lastTickRef.current = performance.now();

    // Start battle loop
    const loop = (now: number) => {
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      battleTimeRef.current += delta;

      setGameState((prev) => {
        if (prev.phase !== 'battle') return prev;

        // Move tick every MOVE_INTERVAL ms
        if (delta >= MOVE_INTERVAL) {
          const { newState, newLog: logUpdate } = processTick(
            { ...prev, battleTime: battleTimeRef.current },
            delta,
            combatLog
          );

          // Extract floating text info from log
          const newTexts: typeof floatingTexts = [];
          for (const entry of logUpdate.slice(-10)) {
            if (entry.type === 'damage') {
              const parts = entry.message.match(/对 (.+?) 造成 (\d+)/);
              if (parts) {
                const targetName = parts[1];
                const dmg = parts[2];
                const target = newState.units.find(
                  (u) => u.config.name === targetName
                );
                if (target) {
                  const px = target.x * CELL_SIZE + CELL_SIZE / 2;
                  const py = target.y * CELL_SIZE + CELL_SIZE / 2;
                  newTexts.push({
                    id: `${Date.now()}-${Math.random()}`,
                    x: px,
                    y: py,
                    text: `-${dmg}`,
                    type: 'damage',
                    time: Date.now(),
                  });
                }
              }
            } else if (entry.type === 'heal') {
              const parts = entry.message.match(/回复 (\d+)/);
              if (parts) {
                const heal = parts[1];
                const nameMatch = entry.message.match(/为 (.+?) 回复/);
                if (nameMatch) {
                  const target = newState.units.find(
                    (u) => u.config.name === nameMatch[1]
                  );
                  if (target) {
                    const px = target.x * CELL_SIZE + CELL_SIZE / 2;
                    const py = target.y * CELL_SIZE + CELL_SIZE / 2;
                    newTexts.push({
                      id: `${Date.now()}-${Math.random()}`,
                      x: px,
                      y: py,
                      text: `+${heal}`,
                      type: 'heal',
                      time: Date.now(),
                    });
                  }
                }
              }
            }
          }

          if (newTexts.length > 0) {
            setFloatingTexts((prev) => [...prev, ...newTexts]);
            setTimeout(() => {
              setFloatingTexts((prev) =>
                prev.filter((t) => !newTexts.find((nt) => nt.id === t.id))
              );
            }, 1500);
          }

          setCombatLog((prevLog) => [...prevLog, ...logUpdate.slice(combatLog.length ? -20 : -30)]);

          if (newState.phase === 'ended') {
            const winnerMsg =
              newState.winner === 'player'
                ? '🏆 玩家获胜！'
                : '💀 敌方获胜！';
            setCombatLog((prev) => [
              ...prev,
              { time: Date.now(), message: winnerMsg, type: 'death' },
            ]);
          }

          return newState;
        }

        return prev;
      });

      setGameState((prev) => {
        if (prev.phase === 'battle') {
          return { ...prev, battleTime: battleTimeRef.current };
        }
        return prev;
      });

      battleLoopRef.current = requestAnimationFrame(loop);
    };

    battleLoopRef.current = requestAnimationFrame(loop);
  }, [gameState.units, combatLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (battleLoopRef.current) cancelAnimationFrame(battleLoopRef.current);
    };
  }, []);

  // Scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [combatLog]);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  // Check if a hero is already placed
  const isHeroPlaced = (heroId: string) =>
    gameState.units.some((u) => !u.isDead && u.team === 'player' && u.config.id === heroId);

  return (
    <div className="game-container">
      {/* Header - Synergies */}
      <div className="synergy-bar">
        <div className="synergy-section player-synergies">
          <span className="synergy-label">我方协同</span>
          {activePlayerSynergies.length === 0 ? (
            <span className="synergy-none">无</span>
          ) : (
            activePlayerSynergies.map((s) => (
              <span key={s.name} className="synergy-badge active">
                {s.name}×{s.count} {s.bonus}
              </span>
            ))
          )}
        </div>
        <div className="battle-time">
          {gameState.phase === 'battle' && formatTime(gameState.battleTime)}
          {gameState.phase === 'ended' && (
            <span className={gameState.winner === 'player' ? 'win-text' : 'lose-text'}>
              {gameState.winner === 'player' ? '胜利!' : '失败'}
            </span>
          )}
        </div>
        <div className="synergy-section enemy-synergies">
          <span className="synergy-label">敌方协同</span>
          {activeEnemySynergies.length === 0 ? (
            <span className="synergy-none">无</span>
          ) : (
            activeEnemySynergies.map((s) => (
              <span key={s.name} className="synergy-badge enemy">
                {s.name}×{s.count} {s.bonus}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="main-area">
        {/* Left - Hero Bench */}
        <div className="hero-bench">
          <div className="bench-title">英雄选择</div>
          <div className="hero-list">
            {HERO_IDS.map((heroId) => {
              const hero = HEROES[heroId];
              const placed = isHeroPlaced(heroId);
              const selected = selectedHeroId === heroId;
              return (
                <div
                  key={heroId}
                  className={`hero-card ${hero.class} ${selected ? 'selected' : ''} ${placed ? 'placed' : ''}`}
                  onClick={() => !placed && setSelectedHeroId(selected ? null : heroId)}
                >
                  <div className="hero-avatar" style={{ background: hero.color }}>
                    {hero.name[0]}
                  </div>
                  <div className="hero-info">
                    <div className="hero-name">{hero.name}</div>
                    <div className="hero-class">{hero.title}</div>
                    <div className="hero-hp-bar">
                      <div
                        className="hero-hp-fill"
                        style={{ width: '100%', background: '#e74c3c' }}
                      />
                    </div>
                    <div className="hero-stats">
                      ⚔️{hero.attack} 🛡️{hero.armor} ⏱️{hero.attackSpeed}ms
                    </div>
                  </div>
                  {placed && <div className="placed-badge">已上场</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Center - Board */}
        <div className="board-wrapper">
          <div className="board-label enemy-label">敌方区域</div>
          <div className="board">
            {Array.from({ length: BOARD_ROWS }).map((_, row) => (
              <div key={row} className="board-row">
                {Array.from({ length: BOARD_COLS }).map((_, col) => {
                  const unit = gameState.units.find(
                    (u) => !u.isDead && u.x === col && u.y === row
                  );
                  const isEnemy = unit?.team === 'enemy';
                  const isPlayer = unit?.team === 'player';
                  const _synergyBonus = unit ? getSynergyBonus(unit, gameState.units) : null;

                  return (
                    <div
                      key={`${col}-${row}`}
                      className={`board-cell ${row < 2 ? 'enemy-zone' : 'player-zone'} ${unit ? 'occupied' : ''} ${isEnemy ? 'enemy-unit' : ''} ${isPlayer ? 'player-unit' : ''}`}
                      onClick={() => handleBoardClick(col, row)}
                    >
                      {unit && (
                        <div
                          className={`unit ${unit.isDead ? 'dead' : ''} ${unit.stunDuration > 0 ? 'stunned' : ''} ${unit.shieldDuration > 0 ? 'shielded' : ''} ${isEnemy ? 'enemy' : 'player'}`}
                          style={{ '--unit-color': unit.config.color } as React.CSSProperties}
                        >
                          <div className="unit-avatar">
                            {unit.config.name[0]}
                          </div>
                          <div className="unit-hp-bar">
                            <div
                              className="unit-hp-fill"
                              style={{ width: `${(unit.hp / unit.maxHp) * 100}%` }}
                            />
                          </div>
                          <div className="unit-hp-text">
                            {unit.hp}/{unit.maxHp}
                          </div>
                          {unit.stunDuration > 0 && (
                            <div className="stun-indicator">💫</div>
                          )}
                          {unit.shieldDuration > 0 && (
                            <div className="shield-indicator">🛡️</div>
                          )}
                          {unit.attackBuff > 0 && (
                            <div className="buff-indicator">⚔️+{Math.round(unit.attackBuff * 100)}%</div>
                          )}
                          {unit.isDead && (
                            <div className="death-overlay">💀</div>
                          )}
                        </div>
                      )}
                      {selectedHeroId && !unit && row >= 2 && (
                        <div className="cell-hint">
                          <span>+</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="board-label player-label">我方区域</div>
        </div>

        {/* Right - Combat Log */}
        <div className="combat-log">
          <div className="log-title">战斗日志</div>
          <div className="log-entries" ref={logRef}>
            {combatLog.slice(-120).map((entry, idx) => (
              <div key={idx} className={`log-entry ${entry.type}`}>
                {entry.message}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer - Controls */}
      <div className="controls">
        <button
          className="btn btn-start"
          onClick={handleStartBattle}
          disabled={gameState.phase !== 'setup' || !isPlayerTeamReady(gameState.units)}
        >
          开始战斗
        </button>
        <button
          className="btn btn-auto"
          onClick={handleAutoFill}
          disabled={gameState.phase !== 'setup'}
        >
          自动填充
        </button>
        <button className="btn btn-reset" onClick={handleReset}>
          重置
        </button>
        <div className="placement-hint">
          {gameState.phase === 'setup' && (
            selectedHeroId
              ? `点击棋盘放置 ${HEROES[selectedHeroId].name}（点击已放置单位可移除）`
              : '选择英雄后点击棋盘放置'
          )}
          {gameState.phase === 'battle' && '⚔️ 战斗中...'}
          {gameState.phase === 'ended' && (
            gameState.winner === 'player' ? '🏆 恭喜获胜！' : '💀 失败...'
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
