# PRD : Module Attribut

**Statut** : Brouillon
**Auteur** : Claude
**Créé le** : 2026-01-30
**Dernière mise à jour** : 2026-01-30

---

## 1. Aperçu

Le module Attribut fournit un système d'attributs flexible et agnostique qui peut être utilisé par plusieurs entités (produits, pages, canaux, etc.) sans couplage fort avec un module spécifique. Cela permet aux marchands de définir des attributs personnalisés pour leurs produits et contenus, tout en offrant aux développeurs un système réutilisable pour ajouter la prise en charge des attributs à n'importe quelle entité.

## 2. Énoncé du problème

### État actuel
- Le système `ProductOption` existant est limité à la différenciation des variantes uniquement
- Le champ `metadata` JSON manque de structure, de validation et de possibilités de requête
- Aucun moyen standardisé d'ajouter des champs personnalisés aux entités
- Chaque module nécessitant des champs personnalisés doit implémenter sa propre solution

### État cible
- Un système d'attributs générique et réutilisable utilisable par n'importe quel module
- Prise en charge de 11 types d'attributs différents avec validation appropriée
- Attributs interrogeables permettant le filtrage et la recherche à facettes
- Stockage de données structuré avec valeurs typées
- Conception agnostique où le même attribut peut être utilisé par différents consommateurs

### Impact
- **Marchands** : Gagnent en flexibilité pour définir des attributs produits correspondant à leurs besoins spécifiques
- **Développeurs** : Peuvent rapidement ajouter la prise en charge des attributs à n'importe quel type d'entité sans réinventer la roue
- **Clients** : Bénéficient de capacités de filtrage et de recherche à facettes enrichies

### Pourquoi maintenant
- Le module Product doit être reconstruit avec une prise en charge appropriée des attributs
- Le module Channel (en planification) aura besoin de métadonnées spécifiques aux canaux
- Un système générique permet un développement plus rapide des futurs modules

## 3. Objectifs

### Objectifs principaux
- [ ] Fournir un système d'attributs réutilisable intégrable par n'importe quel module
- [ ] Prendre en charge 11 types d'attributs : DROPDOWN, MULTISELECT, PLAIN_TEXT, RICH_TEXT, NUMERIC, BOOLEAN, FILE, REFERENCE, SWATCH, DATE, DATE_TIME
- [ ] Permettre le filtrage et la recherche à facettes sur les valeurs d'attributs
- [ ] Maintenir un couplage faible entre le module attribut et les consommateurs

### Non-objectifs (Hors périmètre)
- AttributeGroup pour organiser les attributs (amélioration future)
- Traductions (i18n) pour les attributs et valeurs
- Permissions granulaires par attribut
- Import/export en masse
- Historique des modifications d'attributs / journal d'audit
- Modèles d'attributs par ProductType (géré par le module Product)
- Intégration directe avec une entité spécifique (les consommateurs s'enregistrent eux-mêmes)
- Remplacement du champ metadata JSON (les attributs le complètent)
- Types d'attributs personnalisés/extensibles (architecture préparée, implémentation ultérieure)

## 4. Métriques de succès

| Métrique | Cible | Méthode de mesure |
|----------|-------|-------------------|
| Intégration module | N'importe quel module peut ajouter le support attributs | Test d'intégration avec module Product |
| Validation des types | Les 11 types fonctionnent avec validation appropriée | Tests unitaires par type |
| Performance requêtes | Attributs interrogeables pour filtrage/recherche à facettes | Tests de performance sur requêtes filtrées |
| Couplage faible | Aucune dépendance directe entre module attribut et consommateurs | Revue d'architecture |

## 5. User Stories

### US-001 : Gérer les attributs (CRUD)
**En tant que** développeur de module
**Je veux** créer, lire, modifier et supprimer des définitions d'attributs
**Afin de** gérer le cycle de vie complet des attributs dans mon module

**Priorité** : Haute

### US-002 : Définir des choix de liste déroulante
**En tant que** marchand
**Je veux** créer un attribut avec des choix prédéfinis (ex. : "Matière" : Coton, Laine, Soie)
**Afin de** garantir une saisie de données cohérente pour les attributs produits

**Priorité** : Haute

### US-003 : Définir des valeurs de nuancier
**En tant que** marchand
**Je veux** créer un attribut nuancier avec des codes couleur et/ou des images
**Afin que** les clients puissent parcourir visuellement les couleurs ou motifs des produits

**Priorité** : Haute

### US-004 : Configurer un attribut pour le filtrage
**En tant que** marchand
**Je veux** marquer un attribut comme filtrable
**Afin que** les clients puissent l'utiliser dans la recherche à facettes pour affiner les produits

**Priorité** : Haute

### US-005 : Attribuer des attributs numériques avec unités
**En tant que** marchand
**Je veux** créer un attribut numérique avec une unité (ex. : poids en kg, dimensions en cm)
**Afin que** les spécifications produits soient affichées de manière cohérente

**Priorité** : Moyenne

### US-006 : Référencer une autre entité
**En tant que** développeur de module
**Je veux** créer un attribut de référence qui pointe vers un autre type d'entité
**Afin de** pouvoir créer des relations entre entités (ex. : "Marque associée")

**Priorité** : Moyenne

### US-007 : Réordonner les choix d'attributs
**En tant que** marchand
**Je veux** réordonner les choix pour les attributs dropdown/multiselect/swatch
**Afin que** les valeurs les plus importantes ou courantes apparaissent en premier

**Priorité** : Moyenne

### US-008 : Valider les valeurs selon le type
**En tant que** développeur de module
**Je veux** que les valeurs d'attributs soient validées selon leur type
**Afin de** garantir l'intégrité des données (ex. : format hex pour couleurs, URL valide pour fichiers)

**Priorité** : Haute

## 6. Critères d'acceptation

### Critères d'acceptation US-001
- [ ] Peut créer un attribut avec nom, slug et type
- [ ] Peut lire un attribut par ID ou slug
- [ ] Peut lister les attributs avec filtrage et pagination
- [ ] Peut modifier un attribut existant (nom, is_required, is_filterable, etc.)
- [ ] Peut supprimer un attribut de manière définitive (hard delete)
- [ ] Le slug est unique et auto-généré à partir du nom si non fourni
- [ ] Les 11 types d'attributs sont pris en charge
- [ ] L'attribut possède les indicateurs `is_required` et `is_filterable`
- [ ] L'attribut supporte le verrouillage optimiste via le champ `version`

### Critères d'acceptation US-002
- [ ] Peut ajouter, modifier et supprimer des choix pour les attributs DROPDOWN/MULTISELECT
- [ ] Chaque choix a un `slug` (clé) et une `value` (libellé d'affichage)
- [ ] Le slug est auto-généré à partir de la valeur si non fourni
- [ ] Le slug est unique par attribut (pas globalement)
- [ ] Les choix ont un champ `position` pour l'ordonnancement
- [ ] Les choix sont stockés dans la table `attribute_values`
- [ ] Pas de champ metadata sur les valeurs d'attribut
- [ ] Suppression définitive sur les choix (les consommateurs gèrent leurs relations)

### Critères d'acceptation US-003
- [ ] Peut créer des valeurs de nuancier avec `slug`, `value`, couleur (hex) et/ou fichier
- [ ] Chaque swatch a un `slug` (clé) et une `value` (libellé d'affichage)
- [ ] Le slug est auto-généré à partir de la valeur si non fourni
- [ ] Le slug est unique par attribut (pas globalement)
- [ ] Au moins une couleur ou file_url doit être fournie
- [ ] Le mimetype est requis si file_url est présent
- [ ] Les valeurs de nuancier sont stockées dans une table séparée `attribute_swatch_values`
- [ ] Les valeurs de nuancier ont une position pour l'ordonnancement

### Critères d'acceptation US-004
- [ ] L'indicateur `is_filterable` peut être défini à la création/modification de l'attribut
- [ ] Les attributs filtrables sont interrogeables pour la recherche à facettes
- [ ] Les attributs non filtrables sont exclus des requêtes de filtrage

### Critères d'acceptation US-005
- [ ] Le type NUMERIC supporte un champ `unit` optionnel (enum extensible : KILOGRAM, METER, LITER, etc.)
- [ ] Les valeurs numériques sont stockées dans `attribute_numeric_values` avec précision décimale appropriée
- [ ] L'unité est affichée à côté de la valeur dans les requêtes
- [ ] De nouvelles unités peuvent être ajoutées via migration SQL

### Critères d'acceptation US-006
- [ ] Le type REFERENCE requiert un champ `reference_entity` spécifiant le type d'entité cible
- [ ] Les valeurs REFERENCE sont des choix prédéfinis (comme DROPDOWN/SWATCH)
- [ ] Chaque valeur de référence a un `slug`, une `value` (libellé), et un `reference_id`
- [ ] Le slug est auto-généré à partir de value si non fourni
- [ ] Le slug est unique par attribut
- [ ] Le reference_id est unique par attribut (même entité ne peut être référencée 2x)
- [ ] Les valeurs de référence ont un champ `position` pour l'ordonnancement
- [ ] La résolution des références est gérée par les modules consommateurs

### Critères d'acceptation US-007
- [ ] Peut mettre à jour le champ `position` sur attribute_values et attribute_swatch_values
- [ ] Les valeurs sont retournées ordonnées par position dans les requêtes
- [ ] Les mises à jour de position supportent les opérations par lot

### Critères d'acceptation US-008
- [ ] NUMERIC : validation du format numérique avec précision décimale
- [ ] BOOLEAN : valeurs strictement true/false
- [ ] DATE/DATE_TIME : format ISO 8601 valide
- [ ] FILE : URL valide
- [ ] SWATCH : couleur au format hex (#RRGGBB) et/ou file_url valide avec mimetype
- [ ] REFERENCE : ID d'entité existante du type spécifié
- [ ] PLAIN_TEXT/RICH_TEXT : longueur maximale configurable
- [ ] Slug : format URL-safe (alphanumériques, tirets)
- [ ] Messages d'erreur clairs en cas de validation échouée

## 7. Notes techniques

### Architecture
- Nouveau module suivant le pattern existant : `@czo/attribute`
- Utilise Drizzle ORM pour les requêtes base de données typées
- API GraphQL pour la gestion des attributs
- Services enregistrés via le conteneur IoC

### Schéma de base de données
**Tables principales (dans @czo/attribute) :**
- `attributes` - Définitions d'attributs avec type, indicateurs et métadonnées
- `attribute_values` - Choix prédéfinis pour DROPDOWN/MULTISELECT
- `attribute_swatch_values` - Valeurs de nuancier avec couleur et image_url

**Tables de valeurs typées (dans @czo/attribute) :**
- `attribute_text_values` - Pour PLAIN_TEXT, RICH_TEXT
- `attribute_numeric_values` - Pour NUMERIC
- `attribute_boolean_values` - Pour BOOLEAN
- `attribute_date_values` - Pour DATE, DATE_TIME
- `attribute_file_values` - Pour FILE
- `attribute_reference_values` - Pour REFERENCE

### Pattern d'intégration consommateur
Les consommateurs créent leurs propres tables de jonction pour lier les entités aux attributs :
1. **Table Entité-Attributs** : Quels attributs sont assignés à l'entité
2. **Table Entité-Attribut-Valeurs** : Quelles valeurs sont sélectionnées (avec discriminateur de type)

Ce pattern est personnalisable par consommateur selon ses besoins spécifiques.

### Modifications de l'API
- Nouveau type `Attribute` avec opérations CRUD
- Nouveaux types `AttributeValue` et `AttributeSwatchValue`
- Requêtes pour lister et filtrer les attributs
- Mutations pour gérer les attributs et leurs valeurs

### Considérations de sécurité
- Le slug de l'attribut doit être validé pour prévenir l'injection
- Contrôle d'accès par organisation (quand le multi-tenancy sera implémenté)
- Validation des entrées sur toutes les opérations d'attributs

## 8. Risques et hypothèses

### Hypothèses à valider
- [ ] Stocker SWATCH avec color et image_url dans la même ligne est suffisamment flexible
- [ ] L'ordonnancement basé sur position est suffisant (vs. clés de tri explicites)
- [ ] Les tables de valeurs gérées par les consommateurs ne créeront pas trop de complexité

### Risques
| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Requêtes complexes entre types | Moyenne | Moyen | Fournir des helpers de requêtes dans le service attribut |
| Surcharge d'intégration consommateur | Moyenne | Faible | Documentation claire et fonctions d'aide |
| Performance résolution références | Faible | Moyen | Utiliser le pattern DataLoader pour le batching |

## 9. Dépendances

### Bloqueurs
- Le système de modules @czo/kit doit être stable (complété)

### Dépendances techniques
- Drizzle ORM pour les requêtes typées
- GraphQL Yoga pour la couche API

### Fonctionnalités liées
- Refonte du module Product (sera le premier consommateur)
- Module Channel (consommateur potentiel futur)
- Module Page/CMS (consommateur potentiel futur)

---

## Annexe

### Questions ouvertes
- [x] Devons-nous supporter AttributeGroup ? → **Non, hors périmètre MVP**
- [x] Approche de stockage pour les valeurs assignées ? → **Tables de valeurs typées dans @czo/attribute, les consommateurs créent des tables de jonction**
- [x] Comment gérer le type REFERENCE ? → **Champ `reference_entity` sur Attribute**
- [x] Suppression réversible ou définitive ? → **Suppression définitive (hard delete) sur les attributs ET les valeurs, les consommateurs gèrent leurs relations**

### Références
- [Guide API Attributs Saleor](https://docs.saleor.io/developer/attributes/api)
- [Référence Objet Attribute Saleor](https://docs.saleor.io/docs/3.x/api-reference/attributes/objects/attribute)
- [Document de brainstorm](./brainstorm.md)

### Parties prenantes et approbations
| Nom | Rôle | Date | Signature |
|-----|------|------|-----------|
| [À définir] | Product Owner | [À définir] | En attente |
| [À définir] | Tech Lead | [À définir] | En attente |
