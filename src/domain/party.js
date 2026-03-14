import { canSwapWith, normalizePartyPosition } from './character-style.js';

export const MAX_PARTY_SIZE = 6;

export class Party {
  constructor(members) {
    if (!Array.isArray(members) || members.length !== MAX_PARTY_SIZE) {
      throw new Error(`Party must have exactly ${MAX_PARTY_SIZE} members.`);
    }

    this.members = [...members];
    this._validateUniquePositions();
    this._validateUniquePartyIndices();
  }

  _validateUniquePositions() {
    const seen = new Set();
    for (const member of this.members) {
      if (seen.has(member.position)) {
        throw new Error(`Duplicate position detected: ${member.position}`);
      }
      seen.add(member.position);
    }
  }

  _validateUniquePartyIndices() {
    const seen = new Set();
    for (const member of this.members) {
      if (seen.has(member.partyIndex)) {
        throw new Error(`Duplicate partyIndex detected: ${member.partyIndex}`);
      }
      seen.add(member.partyIndex);
    }
  }

  getSortedByPosition() {
    return [...this.members].sort((a, b) => a.position - b.position);
  }

  getFrontline() {
    return this.getSortedByPosition().filter((member) => member.position <= 2);
  }

  getByPosition(position) {
    return this.members.find((member) => member.position === position) ?? null;
  }

  swap(posA, posB, options = {}) {
    const fromPosition = normalizePartyPosition(posA);
    const toPosition = normalizePartyPosition(posB);
    const memberA = this.getByPosition(fromPosition);
    const memberB = this.getByPosition(toPosition);

    if (!memberA || !memberB) {
      throw new Error(`Cannot swap missing positions: ${fromPosition}, ${toPosition}`);
    }

    const isExtraActive = Boolean(options.isExtraActive);
    const allowedCharacterIds = options.allowedCharacterIds ?? [];
    const allowed = canSwapWith(memberA, memberB, isExtraActive, allowedCharacterIds);

    if (!allowed) {
      throw new Error('Swap is not allowed in current extra-turn constraints.');
    }

    if (fromPosition === toPosition) {
      return {
        from: memberA.characterId,
        to: memberB.characterId,
        fromPosition,
        toPosition,
      };
    }

    memberA.position = toPosition;
    memberB.position = fromPosition;
    memberA._revision += 1;
    memberB._revision += 1;

    return {
      from: memberA.characterId,
      to: memberB.characterId,
      fromPosition,
      toPosition,
    };
  }

  snapshot() {
    return this.getSortedByPosition().map((member) => member.snapshot());
  }

  getRevisionVector() {
    return this.getSortedByPosition().map((member) => ({
      characterId: member.characterId,
      revision: member.revision,
    }));
  }
}
