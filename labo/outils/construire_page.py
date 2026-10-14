"""Assemble apps-script/Page.html : la page servie par Google Apps Script.

HtmlService ne sert qu'un seul fichier HTML : feuille de style et scripts y
sont recopiés. À relancer après toute modification de l'interface, puis
recopier Page.html dans le projet Apps Script.

    python3 outils/construire_page.py
"""
import os
import re

ICI = os.path.dirname(os.path.abspath(__file__))
LABO = os.path.dirname(ICI)


def lire(nom):
    with open(os.path.join(LABO, nom), encoding="utf-8") as fh:
        texte = fh.read()
    if re.search(r"</(script|style)", texte, re.I):
        raise SystemExit("%s contient une balise fermante interdite dans un bloc inline" % nom)
    return texte


def main():
    page = ['<!DOCTYPE html>', '<html lang="fr">', '<!-- Généré par outils/construire_page.py : ne pas modifier à la main. -->', '<head>', '<base target="_top">', '<meta charset="UTF-8">',
            '<meta name="robots" content="noindex, nofollow, noarchive">',
            '<link rel="preconnect" href="https://fonts.googleapis.com">',
            '<link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,700;1,900&family=Hanken+Grotesk:ital,wght@0,400;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">',
            '<style>', lire("style.css"), '</style>', '</head>', '<body>',
            '<main class="page" id="app"><p class="vide">Chargement…</p></main>',
            '<section class="imprimable" id="imprimable" aria-hidden="true"></section>',
            '<div class="toast cache" id="toast" role="status" aria-live="polite"></div>']
    for js in ("core.js", "demo.js", "referentiel.js", "app.js"):
        page += ['<script>', lire(js), '</script>']
    page += ['</body>', '</html>', '']
    sortie = os.path.join(LABO, "apps-script", "Page.html")
    with open(sortie, "w", encoding="utf-8") as fh:
        fh.write("\n".join(page))
    print(sortie)


if __name__ == "__main__":
    main()
