// ui.js — render y utilidades de interfaz (DOM). No conoce reglas de partida.

export function flagSvg() {
  return `<svg class="flag-cl" viewBox="0 0 3 2" role="img" aria-label="Chile" xmlns="http://www.w3.org/2000/svg">
  <rect width="3" height="1" y="0" fill="#fff"/>
  <rect width="3" height="1" y="1" fill="#D52B1E"/>
  <rect width="1" height="1" fill="#0039A6"/>
  <polygon fill="#fff" points="0.5,0.18 0.5718,0.4011 0.8043,0.4011 0.6162,0.5378 0.6881,0.7589 0.5,0.6222 0.3119,0.7589 0.3838,0.5378 0.1957,0.4011 0.4282,0.4011"/>
</svg>`;
}

export function deckIcon(meta) {
  if (meta.icon === 'flag-cl') return flagSvg();
  return `<span class="deck-emoji" aria-hidden="true">${meta.emoji}</span>`;
}

export function deckBadge(meta) {
  return `<span class="deck-badge" style="--deck-color:${meta.color}">${deckIcon(meta)}<span class="deck-label">${meta.label}</span></span>`;
}

export const DIFFICULTY_LABEL = { 1: 'FÁCIL', 2: 'MEDIA', 3: 'DIFÍCIL' };

export function stars(level) {
  return '\u2b50'.repeat(level);
}

export function difficultyText(level) {
  return `${stars(level)} ${DIFFICULTY_LABEL[level] || ''}`.trim();
}

export function pointsText(points) {
  return points === 1 ? '1 PUNTO' : `${points} PUNTOS`;
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

export function fillModalitySelect(select, modalities, selectedId) {
  select.innerHTML = modalities
    .map((modality) => option(modality.id, modality.label, modality.id === selectedId))
    .join('');
}

export function renderTeamsEditor(container, teams, handlers) {
  container.innerHTML = teams
    .map((team, index) => {
      const members = team.members
        .map(
          (member, memberIndex) => `
          <div class="member-row">
            <label class="sr-only" for="m-${index}-${memberIndex}">Nombre del jugador</label>
            <input id="m-${index}-${memberIndex}" class="input member-name" type="text" value="${escapeHtml(member.name)}" placeholder="Jugador ${memberIndex + 1}" data-team="${index}" data-member="${memberIndex}" data-field="name" />
            <label class="check"><input type="checkbox" class="member-child" data-team="${index}" data-member="${memberIndex}" data-field="child"${member.child ? ' checked' : ''} /> <span>niño</span></label>
            <button class="btn btn-ghost btn-small" type="button" data-action="remove-member" data-team="${index}" data-member="${memberIndex}" aria-label="Quitar jugador">✕</button>
          </div>`,
        )
        .join('');

      return `
        <div class="team-block" data-team-index="${index}">
          <div class="team-head">
            <label class="sr-only" for="team-${index}">Nombre del equipo</label>
            <input id="team-${index}" class="input team-name" type="text" value="${escapeHtml(team.name)}" data-team="${index}" data-field="name" />
            <label class="check team-family"><input type="checkbox" data-team="${index}" data-field="family"${team.family ? ' checked' : ''} /> <span>adulto + niño</span></label>
          </div>
          <div class="members">${members}</div>
          <button class="btn btn-secondary btn-small" type="button" data-action="add-member" data-team="${index}">Agregar jugador</button>
        </div>`;
    })
    .join('');

  if (handlers) {
    container.querySelectorAll('[data-action="add-member"]').forEach((button) => {
      button.addEventListener('click', () => handlers.onAddMember(Number(button.dataset.team)));
    });
    container.querySelectorAll('[data-action="remove-member"]').forEach((button) => {
      button.addEventListener('click', () =>
        handlers.onRemoveMember(Number(button.dataset.team), Number(button.dataset.member)),
      );
    });
  }
}

export function renderDecksEditor(container, decks, selectedIds, counts) {
  container.innerHTML = Object.entries(decks)
    .map(([deckId, meta]) => {
      const count = counts[deckId] || 0;
      const checked = selectedIds.includes(deckId);
      return `
        <label class="deck-option">
          <input type="checkbox" value="${deckId}" data-deck="${deckId}"${checked ? ' checked' : ''} />
          <span class="deck-option-body">
            <span class="deck-option-title">${deckIcon(meta)} ${escapeHtml(meta.label)}</span>
            <span class="deck-option-count">${count} tarjetas disponibles</span>
          </span>
        </label>`;
    })
    .join('');
}

export function renderCard(article, card, meta) {
  article.hidden = false;
  article.style.setProperty('--deck-color', meta.color);
  article.querySelector('#pcard-text').textContent = card.text;
  article.querySelector('#pcard-deck').innerHTML = deckBadge(meta);
  article.querySelector('#pcard-difficulty').textContent = difficultyText(card.difficulty);
  article.querySelector('#pcard-points').textContent = pointsText(card.points);
  const restriction = article.querySelector('#pcard-restriction');
  if (card.restrictionLabel) {
    restriction.hidden = false;
    restriction.textContent = `Dibujo imposible: ${card.restrictionLabel}`;
  } else {
    restriction.hidden = true;
    restriction.textContent = '';
  }
}

export function renderScoreboard(list, scores, teams, currentIndex) {
  list.innerHTML = teams
    .map(
      (team, index) => `
      <li class="scoreboard-item${index === currentIndex ? ' is-current' : ''}">
        <span class="scoreboard-name">${escapeHtml(team.name)}${team.family ? ' <span class="tag">adulto+niño</span>' : ''}</span>
        <span class="scoreboard-score">${scores[index]}</span>
      </li>`,
    )
    .join('');
}

export function renderResults(titleEl, subEl, listEl, results) {
  if (results.tie) {
    titleEl.textContent = '¡Empate!';
    subEl.textContent = 'Varios equipos terminaron con el mismo puntaje.';
  } else {
    titleEl.textContent = `¡Gana ${results.winners[0].name}!`;
    subEl.textContent = `${results.rounds} rondas jugadas.`;
  }
  listEl.innerHTML = results.scores
    .slice()
    .sort((a, b) => b.score - a.score)
    .map(
      (entry) => `
      <li class="results-item"><span class="results-name">${escapeHtml(entry.name)}</span><span class="results-score">${entry.score}</span></li>`,
    )
    .join('');
}

let toastTimer = null;
export function showToast(message, timeout = 3200) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, timeout);
}
