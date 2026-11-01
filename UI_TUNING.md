# UI audit and tuning

## Audit

- The HUD mixed several rounds of inline styling and duplicate CSS overrides, so color, type, and motion were hard to tune consistently.
- Hit feedback used a plain cross glyph; damage numbers and kill feed entries created and removed DOM nodes for each event.
- Announcements replaced one another immediately, so multi-kill moments could collide. Menu feedback and reduced-motion options were also limited.
- The existing HUD already had useful foundations: radar, health and ammo bars, reload progress, a directional damage ring, hit-stop, haptics, and score/level feedback.

## Tuning guide

Start with these values:

1. `--primary` in `ui-tokens.css`: main action and kill-feed color.
2. `--accent-cyan`: secondary announcement tier and friendly highlight.
3. `--accent-yellow`: headshots and higher score feedback.
4. `--motion-medium`: announcement entrance duration.
5. `--motion-feed`: kill-feed slide duration.
6. `--motion-damage`: damage-number lifetime animation.
7. `--motion-shock`: announcement shock-line duration.
8. `--ease-overshoot`: announcement and panel pop feel.
9. `S.shake` and `S.reduceFX` in `Rumble_Arena.html`: camera shake and reduced-effects setting.
10. Announcement tiers and hold time in `AnnouncementManager.next()` in `Rumble_Arena.html`.

The work keeps combat, scoring, weapon damage, and AI rules unchanged. Motion settings only affect presentation.
