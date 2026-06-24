-- Remove all rune/relic reward tokens from every monster's reward_track.
-- Monster-kill rewards now only grant actions (e.g. Arcane Abyss Summon), barrier
-- restores, and victory points — never runes or relics. The removed icon_pool ids are
-- the "any basic rune" + "any relic" wildcards, the four origin runes, and the
-- class/named special runes (see REWARD_ICON_SEMANTICS in src/lib/play/locationInteractions.ts).
UPDATE arc_spirits_assets.monsters_v2 AS m
SET reward_track = COALESCE((
    SELECT jsonb_agg(elem ORDER BY ord)
    FROM jsonb_array_elements_text(m.reward_track) WITH ORDINALITY AS t(elem, ord)
    WHERE elem NOT IN (
        '36aab6c9-b98c-4e84-b097-e743f45dde82', -- any basic rune
        '6a85e06a-52cc-483c-aa59-38395a377307', -- any relic
        '87d1f1ad-9c0a-4a65-bb2b-16acebc2d019', -- origin: Cyber City
        '8dd2b283-122b-4965-9184-f1f84e1216f4', -- origin: Forest
        '7248cdca-9b03-4951-bfba-a4d17f7b97c8', -- origin: Lantern Lights
        '4d34484d-4345-448d-b192-a425841ddbc4', -- origin: Tidal Tribe
        '40934631-35fc-4936-943a-c607a9c607be', -- special: Animal
        'c9b3225f-c8a9-4aa8-8e43-56c39cf68974', -- special: Sorcerer
        '88facdb6-3374-4891-af8a-fca2e81b79ef', -- special: Strategist
        '66525fe8-e375-4473-b1c3-88d3c9fd2b1c', -- special: Support
        'de816c21-aa17-4e41-9217-20511c11e9c9', -- special: Swordsman
        'faa39f61-98ec-4f63-a873-766dc4e111f3', -- special: Cursed Spirit
        '895144a1-e0f6-4bdc-a4db-322423f1b922', -- relic: Firecracker
        '75134075-3347-49de-a740-eb99d20b1f1a', -- relic: Flower
        'ca4df196-67fb-4507-973d-1dfac277953d', -- relic: Magnet
        'c8ef5d48-2289-4fee-a34d-b041d3e8bea6'  -- relic: Teapot
    )
), '[]'::jsonb)
WHERE m.reward_track ?| array[
    '36aab6c9-b98c-4e84-b097-e743f45dde82',
    '6a85e06a-52cc-483c-aa59-38395a377307',
    '87d1f1ad-9c0a-4a65-bb2b-16acebc2d019',
    '8dd2b283-122b-4965-9184-f1f84e1216f4',
    '7248cdca-9b03-4951-bfba-a4d17f7b97c8',
    '4d34484d-4345-448d-b192-a425841ddbc4',
    '40934631-35fc-4936-943a-c607a9c607be',
    'c9b3225f-c8a9-4aa8-8e43-56c39cf68974',
    '88facdb6-3374-4891-af8a-fca2e81b79ef',
    '66525fe8-e375-4473-b1c3-88d3c9fd2b1c',
    'de816c21-aa17-4e41-9217-20511c11e9c9',
    'faa39f61-98ec-4f63-a873-766dc4e111f3',
    '895144a1-e0f6-4bdc-a4db-322423f1b922',
    '75134075-3347-49de-a740-eb99d20b1f1a',
    'ca4df196-67fb-4507-973d-1dfac277953d',
    'c8ef5d48-2289-4fee-a34d-b041d3e8bea6'
];
