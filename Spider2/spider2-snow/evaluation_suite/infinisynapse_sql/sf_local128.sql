SELECT 
    b."BowlerID" AS "BowlerID",
    b."BowlerFirstName" AS "FirstName", 
    b."BowlerLastName" AS "LastName",
    tm."MatchID" AS "MatchNumber",
    bs."GameNumber" AS "GameNumber",
    bs."HandiCapScore" AS "HandicapScore",
    t."TourneyDate" AS "TournamentDate",
    t."TourneyLocation" AS "Location"
FROM "BOWLERS" b
JOIN "BOWLER_SCORES" bs ON b."BowlerID" = bs."BowlerID"
JOIN "TOURNEY_MATCHES" tm ON bs."MatchID" = tm."MatchID"
JOIN "TOURNAMENTS" t ON tm."TourneyID" = t."TourneyID"
WHERE bs."WonGame" = 1 
    AND bs."HandiCapScore" <= 190
    AND t."TourneyLocation" IN ('Thunderbird Lanes', 'Totem Lanes', 'Bolero Lanes')
ORDER BY b."BowlerID", t."TourneyLocation", tm."MatchID", bs."GameNumber";
SELECT 
    "BowlerID",
    "FirstName",
    "LastName",
    COUNT(DISTINCT "Location") as "VenueCount"
FROM bowler_results
GROUP BY "BowlerID", "FirstName", "LastName"
HAVING COUNT(DISTINCT "Location") = 3
ORDER BY "BowlerID";
SELECT 
    br."BowlerID",
    br."FirstName", 
    br."LastName",
    br."MatchNumber",
    br."GameNumber",
    br."HandicapScore",
    br."TournamentDate",
    br."Location"
FROM bowler_results br
JOIN bowlers_three_venues btv ON br."BowlerID" = btv."BowlerID"
ORDER BY br."BowlerID", br."Location", br."MatchNumber", br."GameNumber";