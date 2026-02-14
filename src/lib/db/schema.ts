import {
  pgTable,
  pgEnum,
  varchar,
  integer,
  timestamp,
  jsonb,
  serial,
  index,
  uniqueIndex,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { Card, SidePot } from '../poker/types';

// ============================================================
// Enums
// ============================================================

export const agentTypeEnum = pgEnum('agent_type', [
  'human',
  'house_fish',
  'house_tag',
  'house_lag',
]);

export const actionTypeEnum = pgEnum('action_type', [
  'fold',
  'check',
  'call',
  'bet',
  'raise',
  'all-in',
]);

export const bettingRoundEnum = pgEnum('betting_round', [
  'preflop',
  'flop',
  'turn',
  'river',
]);

// ============================================================
// Tables
// ============================================================

/** The 4 pre-configured poker tables (seeded). */
export const tableConfigs = pgTable('table_configs', {
  id: varchar('id', { length: 32 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  smallBlind: integer('small_blind').notNull(),
  bigBlind: integer('big_blind').notNull(),
  minBuyIn: integer('min_buy_in').notNull(),
  maxBuyIn: integer('max_buy_in').notNull(),
  maxSeats: integer('max_seats').notNull().default(6),
});

/** Every player/bot that has ever sat down. */
export const agents = pgTable(
  'agents',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    name: varchar('name', { length: 128 }).notNull(),
    type: agentTypeEnum('type').notNull(),
    privyUserId: varchar('privy_user_id', { length: 256 }),
    totalProfit: integer('total_profit').notNull().default(0),
    handsPlayed: integer('hands_played').notNull().default(0),
    handsWon: integer('hands_won').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_agents_type').on(table.type),
    index('idx_agents_privy_user_id').on(table.privyUserId),
    index('idx_agents_total_profit').on(table.totalProfit),
  ],
);

/** One row per completed poker hand. */
export const hands = pgTable(
  'hands',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    tableId: varchar('table_id', { length: 32 })
      .notNull()
      .references(() => tableConfigs.id),
    handNumber: integer('hand_number').notNull(),
    communityCards: jsonb('community_cards').$type<Card[]>().notNull(),
    potTotal: integer('pot_total').notNull(),
    sidePots: jsonb('side_pots').$type<SidePot[]>(),
    dealerSeatNumber: integer('dealer_seat_number').notNull(),
    sbSeatNumber: integer('sb_seat_number').notNull(),
    bbSeatNumber: integer('bb_seat_number').notNull(),
    winners: jsonb('winners')
      .$type<{ agentId: string; agentName: string; amount: number; handName: string }[]>()
      .notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_hands_table_id').on(table.tableId),
    index('idx_hands_completed_at').on(table.completedAt),
    index('idx_hands_table_hand_number').on(table.tableId, table.handNumber),
  ],
);

/** Each player's participation in a hand. */
export const handPlayers = pgTable(
  'hand_players',
  {
    id: serial('id').primaryKey(),
    handId: varchar('hand_id', { length: 128 })
      .notNull()
      .references(() => hands.id),
    agentId: varchar('agent_id', { length: 128 })
      .notNull()
      .references(() => agents.id),
    seatNumber: integer('seat_number').notNull(),
    position: varchar('position', { length: 8 }).notNull(),
    holeCards: jsonb('hole_cards').$type<Card[]>(),
    startingStack: integer('starting_stack').notNull(),
    endingStack: integer('ending_stack').notNull(),
    netProfit: integer('net_profit').notNull(),
    isWinner: boolean('is_winner').notNull().default(false),
    finalHandName: varchar('final_hand_name', { length: 64 }),
  },
  (table) => [
    index('idx_hand_players_hand_id').on(table.handId),
    index('idx_hand_players_agent_id').on(table.agentId),
    index('idx_hand_players_agent_position').on(table.agentId, table.position),
    uniqueIndex('idx_hand_players_hand_agent').on(table.handId, table.agentId),
  ],
);

/** Every decision point / action in a hand. */
export const handActions = pgTable(
  'hand_actions',
  {
    id: serial('id').primaryKey(),
    handId: varchar('hand_id', { length: 128 })
      .notNull()
      .references(() => hands.id),
    agentId: varchar('agent_id', { length: 128 })
      .notNull()
      .references(() => agents.id),
    seatNumber: integer('seat_number').notNull(),
    action: actionTypeEnum('action').notNull(),
    amount: integer('amount').notNull().default(0),
    round: bettingRoundEnum('round').notNull(),
    sequenceNumber: integer('sequence_number').notNull(),
    actionTimestamp: timestamp('action_timestamp', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_hand_actions_hand_id').on(table.handId),
    index('idx_hand_actions_agent_id').on(table.agentId),
    index('idx_hand_actions_agent_round_action').on(table.agentId, table.round, table.action),
    index('idx_hand_actions_hand_seq').on(table.handId, table.sequenceNumber),
  ],
);

/** Audit trail: buy-ins, cash-outs, and pot winnings. */
export const chipTransactions = pgTable(
  'chip_transactions',
  {
    id: serial('id').primaryKey(),
    agentId: varchar('agent_id', { length: 128 })
      .notNull()
      .references(() => agents.id),
    tableId: varchar('table_id', { length: 32 })
      .notNull()
      .references(() => tableConfigs.id),
    handId: varchar('hand_id', { length: 128 }).references(() => hands.id),
    type: varchar('type', { length: 16 }).notNull(),
    amount: integer('amount').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_chip_tx_agent_id').on(table.agentId),
    index('idx_chip_tx_table_id').on(table.tableId),
    index('idx_chip_tx_hand_id').on(table.handId),
  ],
);

// ============================================================
// Relations
// ============================================================

export const tableConfigsRelations = relations(tableConfigs, ({ many }) => ({
  hands: many(hands),
  chipTransactions: many(chipTransactions),
}));

export const agentsRelations = relations(agents, ({ many }) => ({
  handPlayers: many(handPlayers),
  handActions: many(handActions),
  chipTransactions: many(chipTransactions),
}));

export const handsRelations = relations(hands, ({ one, many }) => ({
  table: one(tableConfigs, { fields: [hands.tableId], references: [tableConfigs.id] }),
  players: many(handPlayers),
  actions: many(handActions),
  chipTransactions: many(chipTransactions),
}));

export const handPlayersRelations = relations(handPlayers, ({ one }) => ({
  hand: one(hands, { fields: [handPlayers.handId], references: [hands.id] }),
  agent: one(agents, { fields: [handPlayers.agentId], references: [agents.id] }),
}));

export const handActionsRelations = relations(handActions, ({ one }) => ({
  hand: one(hands, { fields: [handActions.handId], references: [hands.id] }),
  agent: one(agents, { fields: [handActions.agentId], references: [agents.id] }),
}));

export const chipTransactionsRelations = relations(chipTransactions, ({ one }) => ({
  agent: one(agents, { fields: [chipTransactions.agentId], references: [agents.id] }),
  table: one(tableConfigs, { fields: [chipTransactions.tableId], references: [tableConfigs.id] }),
  hand: one(hands, { fields: [chipTransactions.handId], references: [hands.id] }),
}));
