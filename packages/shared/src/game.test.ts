import { describe, expect, test } from 'bun:test';
import { boardEntryId, createInitialContext, isBoardEntryDone, revealClue, type BoardEntry } from './game';

describe('clues', () => {
	test('requires one final period clue after the full clue is visible', () => {
		let context = createInitialContext();
		const clue: BoardEntry = {
			type: 'clue',
			value: '',
			fullValue: 'RUST',
		};
		context.teams.sun.board.push(clue);

		for (const value of ['R', 'RU', 'RUS', 'RUST']) {
			context = revealClue(context, boardEntryId('sun', 0));
			expect(context.teams.sun.board[0]?.value).toBe(value);
			expect(isBoardEntryDone(context, context.teams.sun.board[0])).toBe(false);
		}

		context = revealClue(context, boardEntryId('sun', 0));
		expect(context.teams.sun.board[0]?.value).toBe('RUST.');
		expect(isBoardEntryDone(context, context.teams.sun.board[0])).toBe(true);
	});

	test('records the character revealed by an eye hint', () => {
		let context = createInitialContext();
		const clue: BoardEntry = {
			type: 'clue',
			value: 'RU',
			fullValue: 'RUST',
		};
		context.teams.sun.board.push(clue);

		context = revealClue(context, boardEntryId('sun', 0), boardEntryId('moon', 2));

		expect(context.teams.sun.board[0]?.value).toBe('RUS');
		expect(context.teams.sun.board[0]?.hint).toBe('moon:2');
		expect(context.teams.sun.board[0]?.hintIndexes).toEqual([2]);
	});
});
