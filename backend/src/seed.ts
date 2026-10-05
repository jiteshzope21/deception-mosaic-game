/**
 * MOSAIC — Database Seed Script
 *
 * Run this ONCE to seed the required static data.
 * Usage: npx tsx src/seed.ts
 *
 * Seeds:
 *   1. Fixed QR codes (QR-01 through QR-10) — permanent physical assets
 *   2. Physical tasks (6 default zones)
 *   3. Default game configuration (singleton)
 *   4. Demo decoy messages
 *   5. Demo questions (Q-001 through Q-010 as examples)
 *   6. GM account (requires GM_EMAIL and GM_PASSWORD env vars)
 *
 * NOTE: The GM account is created by the event organizer.
 * Set GM_EMAIL and GM_PASSWORD in environment before running.
 * This script NEVER hard-codes credentials.
 */

import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

import { connectDatabase } from './config/database';
import { FixedQrCode } from './models/FixedQrCode.model';
import { PhysicalTask } from './models/PhysicalTask.model';
import { GameConfiguration } from './models/GameConfiguration.model';
import { DecoyMessage } from './models/DecoyMessage.model';
import { Question } from './models/Question.model';
import { GmAccount } from './models/GmAccount.model';
import { GAME_CONSTANTS } from './config/constants';
import { AnswerOption } from './types/game.types';

async function seed() {
  await connectDatabase();

  // ── 1. Fixed QR codes ───────────────────────────────────────────────────────
  console.log('Seeding QR codes...');
  for (const qrId of GAME_CONSTANTS.QR_IDS) {
    await FixedQrCode.findOneAndUpdate(
      { qrId },
      { qrId, displayLabel: `Physical QR Code ${qrId}` },
      { upsert: true, new: true }
    );
  }
  console.log(`  ✓ ${GAME_CONSTANTS.QR_IDS.length} QR codes seeded`);

  // ── 2. Physical tasks ────────────────────────────────────────────────────────
  console.log('Seeding physical tasks...');
  for (const task of GAME_CONSTANTS.DEFAULT_TASKS) {
    await PhysicalTask.findOneAndUpdate(
      { zoneNumber: task.zoneNumber },
      {
        zoneNumber: task.zoneNumber,
        taskName: task.taskName,
        description: `ZONE 0${task.zoneNumber} — ${task.taskName}`,
        instructions: 'Physical task. Follow physical task instructions at the zone.',
        isActive: true,
        // NOTE: NO completed/verified/approved fields
      },
      { upsert: true, new: true }
    );
  }
  console.log('  ✓ 6 physical tasks seeded');

  // ── 3. Game configuration (singleton) ────────────────────────────────────────
  console.log('Seeding game configuration...');
  const existingConfig = await GameConfiguration.findOne({ _singleton: true });
  if (!existingConfig) {
    await GameConfiguration.create({ _singleton: true });
    console.log('  ✓ Default game configuration created');
  } else {
    console.log('  ✓ Game configuration already exists (skipped)');
  }

  // ── 4. Demo decoy messages ───────────────────────────────────────────────────
  console.log('Seeding demo decoy messages...');
  const demoDecoys = [
    `Nothing here! Try another QR Buddy! 🔍`,
    `Oops, wrong one! Try another QR Buddy! Keep looking...`,
    `This one's a trap! Try another QR Buddy! 😅`,
    `Not this time! Try another QR Buddy! You got this.`,
    `Almost! But not quite. Try another QR Buddy! 👀`,
  ];
  for (const message of demoDecoys) {
    const existing = await DecoyMessage.findOne({ message });
    if (!existing) {
      await DecoyMessage.create({ message, isActive: true });
    }
  }
  console.log(`  ✓ ${demoDecoys.length} demo decoy messages seeded`);

  // ── 5. Demo questions (Q-001 through Q-010) ──────────────────────────────────
  console.log('Seeding demo questions (Q-001 through Q-010)...');
  // IMPORTANT: These are DEMO/PLACEHOLDER questions for development.
  // Replace all 50 questions with real event content before the live event.
  const demoQuestions = [
    {
      questionId: 'Q-001',
      category: 'Computer Science',
      questionText: '[DEMO] What does CPU stand for?',
      optionA: 'Central Processing Unit',
      optionB: 'Computer Personal Unit',
      optionC: 'Central Program Utility',
      optionD: 'Core Processing Unit',
      correctAnswer: AnswerOption.A,
      technicalExplanation: 'CPU stands for Central Processing Unit — the primary component executing program instructions.',
    },
    {
      questionId: 'Q-002',
      category: 'Networking',
      questionText: '[DEMO] What protocol is used to assign IP addresses automatically?',
      optionA: 'DNS',
      optionB: 'FTP',
      optionC: 'DHCP',
      optionD: 'HTTP',
      correctAnswer: AnswerOption.C,
      technicalExplanation: 'DHCP (Dynamic Host Configuration Protocol) automatically assigns IP addresses to devices on a network.',
    },
    {
      questionId: 'Q-003',
      category: 'Programming',
      questionText: '[DEMO] Which data structure uses LIFO ordering?',
      optionA: 'Queue',
      optionB: 'Stack',
      optionC: 'Heap',
      optionD: 'Tree',
      correctAnswer: AnswerOption.B,
      technicalExplanation: 'A Stack uses Last In, First Out (LIFO) ordering — the last element pushed is the first popped.',
    },
    {
      questionId: 'Q-004',
      category: 'Electronics',
      questionText: '[DEMO] What does LED stand for?',
      optionA: 'Light Emitting Diode',
      optionB: 'Low Energy Display',
      optionC: 'Linear Electronic Device',
      optionD: 'Light Emission Detector',
      correctAnswer: AnswerOption.A,
      technicalExplanation: 'LED stands for Light Emitting Diode, a semiconductor that emits light when current flows through it.',
    },
    {
      questionId: 'Q-005',
      category: 'Operating Systems',
      questionText: '[DEMO] What is a process in OS terminology?',
      optionA: 'A file on disk',
      optionB: 'A program in execution',
      optionC: 'A hardware component',
      optionD: 'A network packet',
      correctAnswer: AnswerOption.B,
      technicalExplanation: 'A process is an instance of a program in execution, with its own memory space and system resources.',
    },
    {
      questionId: 'Q-006',
      category: 'Machine Learning',
      questionText: '[DEMO] What is overfitting in ML?',
      optionA: 'Model learns training data too well, fails on new data',
      optionB: 'Model has too many layers',
      optionC: 'Training takes too long',
      optionD: 'Dataset is too small',
      correctAnswer: AnswerOption.A,
      technicalExplanation: 'Overfitting occurs when a model learns noise in training data and cannot generalize to unseen data.',
    },
    {
      questionId: 'Q-007',
      category: 'Computer Science',
      questionText: '[DEMO] What does RAM stand for?',
      optionA: 'Read Access Memory',
      optionB: 'Random Access Memory',
      optionC: 'Rapid Application Memory',
      optionD: 'Runtime Address Memory',
      correctAnswer: AnswerOption.B,
      technicalExplanation: 'RAM (Random Access Memory) is volatile memory used to store data currently in use by programs.',
    },
    {
      questionId: 'Q-008',
      category: 'Algorithms',
      questionText: '[DEMO] What is the time complexity of binary search?',
      optionA: 'O(n)',
      optionB: 'O(n²)',
      optionC: 'O(log n)',
      optionD: 'O(1)',
      correctAnswer: AnswerOption.C,
      technicalExplanation: 'Binary search has O(log n) complexity because it halves the search space with each comparison.',
    },
    {
      questionId: 'Q-009',
      category: 'Electronics',
      questionText: '[DEMO] What does a breadboard allow engineers to do?',
      optionA: 'Permanently solder circuits',
      optionB: 'Prototype circuits without soldering',
      optionC: 'Measure electrical resistance',
      optionD: 'Generate electrical power',
      correctAnswer: AnswerOption.B,
      technicalExplanation: 'A breadboard is a reusable platform for prototyping electronic circuits without soldering.',
    },
    {
      questionId: 'Q-010',
      category: 'Networking',
      questionText: '[DEMO] What does HTTP stand for?',
      optionA: 'Hyper Text Transfer Protocol',
      optionB: 'High Transfer Text Protocol',
      optionC: 'Hyperlink Text Transmission Protocol',
      optionD: 'Host Transfer Text Protocol',
      correctAnswer: AnswerOption.A,
      technicalExplanation: 'HTTP (HyperText Transfer Protocol) is the foundation of data communication on the web.',
    },
  ];

  for (const q of demoQuestions) {
    await Question.findOneAndUpdate(
      { questionId: q.questionId },
      { ...q, isActive: true },
      { upsert: true, new: true }
    );
  }
  console.log(`  ✓ ${demoQuestions.length} demo questions seeded`);
  console.log('  ⚠ REMINDER: Add remaining Q-011 through Q-050 with real event content');

  // ── 6. GM Account ────────────────────────────────────────────────────────────
  console.log('Checking GM account...');
  const gmEmail = process.env.GM_EMAIL;
  const gmPassword = process.env.GM_PASSWORD;

  if (!gmEmail || !gmPassword) {
    console.log('  ⚠ GM_EMAIL or GM_PASSWORD not set. Skipping GM account creation.');
    console.log('  Set GM_EMAIL and GM_PASSWORD in .env then re-run seed to create GM account.');
  } else {
    const existingGm = await GmAccount.findOne({ email: gmEmail.toLowerCase() });
    if (existingGm) {
      console.log(`  ✓ GM account already exists: ${gmEmail}`);
    } else {
      const passwordHash = await bcrypt.hash(gmPassword, 12);
      await GmAccount.create({
        email: gmEmail.toLowerCase(),
        passwordHash,
        displayName: 'Game Master',
      });
      console.log(`  ✓ GM account created: ${gmEmail}`);
      console.log('  ⚠ Keep GM credentials secure — do not commit them to git');
    }
  }

  console.log('\n✅ Seed complete!');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
