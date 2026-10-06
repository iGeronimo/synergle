---
layout: layouts/page.njk
title: About
lede: "A daily puzzle for people who know their champions."
description: "About Synergle, a free daily connections-style puzzle for Teamfight Tactics players."
---

{{ site.name }} is a free browser puzzle for **Teamfight Tactics** players. Every day it puts sixteen champions from the current set on the board and asks you to sort them into four groups of four. If you've ever stared at a shop wondering which unit completes your trait, you already know how to play.

## How the puzzles are made

Each set gets a pool of categories. Most come straight from the game data: shop costs, traits, how many traits a champion has, champions handed out by augments, and attack range. The rest are written by hand: ability effects checked against every tooltip, League of Legends lore, and wordplay.

A generator then builds each puzzle. It picks one category per difficulty level and chooses champions that sometimes fit two groups, to keep you honest. Then it **checks every possible way to split the board** and only keeps puzzles with exactly one valid solution. Champions that arguably fit a category, like a knock-up in a stun group, are kept off the board.

## When a new set launches

When Riot releases a new TFT set, {{ site.name }} switches to the new champion pool for upcoming puzzles. Past puzzles keep their original champions, so the [archive](/archive/) always works.

## Data and credits

Champion, trait and augment data comes from [Community Dragon](https://www.communitydragon.org/), which extracts it from the game files. Champion artwork belongs to Riot Games.

{{ site.name }} was created under Riot Games' ["Legal Jibber Jabber"](https://www.riotgames.com/en/legal) policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project. {{ site.name }} is an independent fan project and isn't affiliated with The New York Times, whose *Connections* puzzle inspired the format.

## Support the site

{{ site.name }} is free to play and paid for by advertising. If something looks wrong, such as a category that seems unfair or a champion in the wrong group, please [get in touch](/contact/).
