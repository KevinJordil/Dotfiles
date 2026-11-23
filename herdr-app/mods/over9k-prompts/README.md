# Over9k Timeline

De herunan/herdr-over9k (commit a53c200, licence MIT : LICENSE). Trois changements : mod.json `place: "none"`, main.js suit l'agent de l'onglet quand la Discussion a le focus et ne dessine que les 50 dernières demandes ;
le panneau est déjà dans layouts/kevin.json (pile « panel-body », bouton Timeline de kevin-tabs) ; « right » faisait
envelopper le layout par l'app. Dans la Discussion, le temps et les jetons en direct manquent (lus sur le compteur de la console).
