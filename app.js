// Miroirs des favoris : croise la liste GitHub (navigateur, cache localStorage) avec l'état des
// copies locales fourni par index.php, et produit les commandes à lancer à la main.
(() => {
    'use strict';

    const data      = JSON.parse(document.getElementById('donnees').textContent);
    const CACHE_KEY = `miroirs.starred.${data.user}.v1`;
    const NOM_SUR   = /^[A-Za-z0-9._-]+$/;

    const tbody     = document.getElementById('lignes');
    const tri       = document.getElementById('tri');
    const annonce   = document.getElementById('annonce');
    const source    = document.getElementById('source');
    const selection = document.getElementById('selection');
    const coches    = new Set();

    let favoris = [];

    // --- Formatage ---
    const fmtDate = iso => iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    function fmtTaille(octets) {
        if (octets == null) return '';
        const unites = ['o', 'Ko', 'Mo', 'Go'];
        let v = octets, i = 0;
        while (v >= 1024 && i < unites.length - 1) { v /= 1024; i++; }
        return `${v.toLocaleString('fr-FR', { maximumFractionDigits: i ? 1 : 0 })} ${unites[i]}`;
    }
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function annoncer(msg) {
        // Vider puis réécrire : un message identique est relu par les lecteurs d'écran.
        annonce.textContent = '';
        setTimeout(() => { annonce.textContent = msg; }, 50);
    }

    // --- GitHub ---
    // API publique sans token : 60 requêtes / heure, d'où le cache et l'actualisation à la demande.
    async function chargerGithub() {
        const tous = [];
        for (let page = 1; ; page++) {
            const r = await fetch(`https://api.github.com/users/${encodeURIComponent(data.user)}/starred?per_page=100&page=${page}`,
                { headers: { Accept: 'application/vnd.github+json' } });
            if (!r.ok) {
                const reset = r.headers.get('X-RateLimit-Reset');
                const quand = reset ? ` (quota rétabli vers ${fmtDate(new Date(reset * 1000).toISOString())})` : '';
                throw new Error(`GitHub a répondu ${r.status}${quand}`);
            }
            const lot = await r.json();
            tous.push(...lot.map(d => ({
                nom: d.full_name, url: d.html_url, description: d.description, langage: d.language,
                etoiles: d.stargazers_count, push: d.pushed_at, taille: d.size * 1024,
                archive: d.archived, licence: d.license?.spdx_id ?? null, clone: d.clone_url,
            })));
            if (lot.length < 100) break;
        }
        const cache = { date: new Date().toISOString(), favoris: tous };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        return cache;
    }

    // --- Lignes : favoris + copies locales orphelines ---
    function lignes() {
        const local = { ...data.local };
        const res = favoris.map(f => {
            const cle = f.nom.toLowerCase();
            const loc = local[cle] ?? null;
            delete local[cle];
            return { ...f, local: loc };
        });
        // Copie locale sans favori correspondant : on la montre pour ne pas l'oublier.
        Object.values(local).forEach(loc => res.push({ nom: loc.nom, url: `https://github.com/${loc.nom}`, local: loc, horsFavoris: true }));
        return res.map(l => ({ ...l, statut: statut(l) }));
    }

    function statut(l) {
        if (l.horsFavoris) return { cle: 'hors', ordre: 0, texte: 'Hors favoris' };
        if (!l.local) return { cle: 'absent', ordre: 1, texte: 'Pas de copie' };
        if (!l.local.synchro || new Date(l.push) > new Date(l.local.synchro)) return { cle: 'retard', ordre: 2, texte: 'En retard' };
        return { cle: 'ok', ordre: 3, texte: 'À jour' };
    }

    // Commande à lancer : clone miroir la première fois, mise à jour ensuite (sans --prune).
    function commande(l) {
        const [owner, repo] = l.nom.split('/');
        if (!NOM_SUR.test(owner ?? '') || !NOM_SUR.test(repo ?? '')) return null;
        const cible = `'${data.reposDir}/${owner}__${repo}.git'`;
        if (l.horsFavoris || l.local) return `git -C ${cible} remote update`;
        return `git clone --mirror https://github.com/${owner}/${repo}.git ${cible}`;
    }

    const TRIS = {
        push:   (a, b) => (b.push ?? '').localeCompare(a.push ?? ''),
        statut: (a, b) => a.statut.ordre - b.statut.ordre || (b.push ?? '').localeCompare(a.push ?? ''),
        nom:    (a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }),
        taille: (a, b) => (b.taille ?? 0) - (a.taille ?? 0),
    };

    // --- Rendu ---
    function rendre() {
        const liste = lignes().sort(TRIS[tri.value]);
        if (!liste.length) {
            tbody.innerHTML = '<tr><td colspan="7">Aucun favori ni copie locale.</td></tr>';
            return;
        }
        tbody.innerHTML = liste.map((l, i) => {
            const cmd = commande(l);
            const id  = `cmd-${i}`;
            const infos = [l.langage, l.licence, l.etoiles != null ? `${l.etoiles.toLocaleString('fr-FR')} étoiles` : null, l.archive ? 'archivé' : null]
                .filter(Boolean).map(esc).join(' · ');
            return `<tr>
                <td>${cmd ? `<input type="checkbox" class="coche" data-cmd="${esc(cmd)}" aria-label="Sélectionner ${esc(l.nom)}" ${coches.has(cmd) ? 'checked' : ''}>` : ''}</td>
                <th scope="row">
                    <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.nom)}<span class="sr-only"> (nouvel onglet)</span><span aria-hidden="true"> ↗</span></a>
                    ${l.description ? `<p class="desc">${esc(l.description)}</p>` : ''}
                    ${infos ? `<p class="discret">${infos}</p>` : ''}
                    ${l.push ? `<p class="discret"><a href="${esc(l.url)}/commits" target="_blank" rel="noopener">Derniers commits<span class="sr-only"> de ${esc(l.nom)} (nouvel onglet)</span><span aria-hidden="true"> ↗</span></a></p>` : ''}
                </th>
                <td>${l.push ? `<time datetime="${esc(l.push)}">${esc(fmtDate(l.push))}</time>` : ''}</td>
                <td>${l.local?.synchro ? `<time datetime="${esc(l.local.synchro)}">${esc(fmtDate(l.local.synchro))}</time>` : (l.local ? 'inconnue' : '')}</td>
                <td>${[l.taille, l.local?.taille].filter(t => t != null).map(t => esc(fmtTaille(t))).join(' / ')}</td>
                <td><span class="statut statut--${l.statut.cle}">${esc(l.statut.texte)}</span></td>
                <td>${cmd ? `<code id="${id}">${esc(cmd)}</code>
                    <button type="button" class="copier" data-cible="${id}" aria-label="Copier la commande de ${esc(l.nom)}">Copier</button>` : 'Nom invalide'}</td>
            </tr>`;
        }).join('');
        majSelection();
    }

    function majSelection() {
        selection.value = [...coches].join('\n');
    }

    async function copier(texte, quoi) {
        try {
            await navigator.clipboard.writeText(texte);
            annoncer(`${quoi} copiée`);
        } catch {
            annoncer('Copie impossible : sélectionner le texte à la main');
        }
    }

    // --- Événements ---
    tbody.addEventListener('change', e => {
        if (!e.target.classList.contains('coche')) return;
        e.target.checked ? coches.add(e.target.dataset.cmd) : coches.delete(e.target.dataset.cmd);
        majSelection();
    });
    tbody.addEventListener('click', e => {
        const btn = e.target.closest('.copier');
        if (btn) copier(document.getElementById(btn.dataset.cible).textContent, 'Commande');
    });
    document.getElementById('copier-selection').addEventListener('click', () => {
        if (selection.value) copier(selection.value, 'Sélection');
        else annoncer('Aucun dépôt sélectionné');
    });
    tri.addEventListener('change', rendre);

    async function actualiser() {
        annoncer('Lecture des favoris sur GitHub…');
        try {
            const cache = await chargerGithub();
            favoris = cache.favoris;
            source.textContent = `Favoris lus le ${fmtDate(cache.date)}`;
            annoncer(`${favoris.length} favoris chargés`);
        } catch (err) {
            annoncer(`Échec : ${err.message}. Données en cache conservées.`);
        }
        rendre();
    }
    document.getElementById('actualiser').addEventListener('click', actualiser);

    // Démarrage : le cache s'il existe, sinon un premier appel à GitHub.
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (cache) {
        favoris = cache.favoris;
        source.textContent = `Favoris lus le ${fmtDate(cache.date)} (cache)`;
        rendre();
    } else {
        actualiser();
    }
})();
