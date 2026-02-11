SELECT 
    "state_name" AS "state",
    'Postal Code' AS "level",
    SUM("count_qualified") AS "total_buildings",
    AVG("percent_covered") AS "avg_coverage_percent",
    AVG("percent_qualified") AS "avg_suitable_percent",
    SUM("number_of_panels_total") AS "total_panels",
    SUM("kw_total") AS "total_kw_capacity",
    SUM("yearly_sunlight_kwh_total") AS "total_energy_potential",
    SUM("carbon_offset_metric_tons") AS "total_carbon_offset",
    SUM("existing_installs_count") AS "current_installations",
    SUM("count_qualified" * "percent_covered" / 100 * "percent_qualified" / 100) - SUM("existing_installs_count") AS "installation_gap"
FROM "SUNROOF_SOLAR_SUNROOF_SOLAR"."SOLAR_POTENTIAL_BY_POSTAL_CODE"
WHERE "state_name" IS NOT NULL
GROUP BY "state_name"
ORDER BY "state_name";
SELECT 
    "state_name" AS "state",
    'Census Tract' AS "level",
    SUM("count_qualified") AS "total_buildings",
    AVG("percent_covered") AS "avg_coverage_percent",
    AVG("percent_qualified") AS "avg_suitable_percent",
    SUM("number_of_panels_total") AS "total_panels",
    SUM("kw_total") AS "total_kw_capacity",
    SUM("yearly_sunlight_kwh_total") AS "total_energy_potential",
    SUM("carbon_offset_metric_tons") AS "total_carbon_offset",
    SUM("existing_installs_count") AS "current_installations",
    SUM("count_qualified" * "percent_covered" / 100 * "percent_qualified" / 100) - SUM("existing_installs_count") AS "installation_gap"
FROM "SUNROOF_SOLAR_SUNROOF_SOLAR"."SOLAR_POTENTIAL_BY_CENSUSTRACT"
WHERE "state_name" IS NOT NULL
GROUP BY "state_name"
ORDER BY "state_name";
SELECT * FROM (
    SELECT 
        "state_name" AS "state",
        'Postal Code' AS "level",
        SUM("count_qualified") AS "total_buildings",
        AVG("percent_covered") AS "avg_coverage_percent",
        AVG("percent_qualified") AS "avg_suitable_percent",
        SUM("number_of_panels_total") AS "total_panels",
        SUM("kw_total") AS "total_kw_capacity",
        SUM("yearly_sunlight_kwh_total") AS "total_energy_potential",
        SUM("carbon_offset_metric_tons") AS "total_carbon_offset",
        SUM("existing_installs_count") AS "current_installations",
        SUM("count_qualified" * "percent_covered" / 100 * "percent_qualified" / 100) - SUM("existing_installs_count") AS "installation_gap"
    FROM "SUNROOF_SOLAR_SUNROOF_SOLAR"."SOLAR_POTENTIAL_BY_POSTAL_CODE"
    WHERE "state_name" IS NOT NULL
    GROUP BY "state_name"
    UNION ALL
    SELECT 
        "state_name" AS "state",
        'Census Tract' AS "level",
        SUM("count_qualified") AS "total_buildings",
        AVG("percent_covered") AS "avg_coverage_percent",
        AVG("percent_qualified") AS "avg_suitable_percent",
        SUM("number_of_panels_total") AS "total_panels",
        SUM("kw_total") AS "total_kw_capacity",
        SUM("yearly_sunlight_kwh_total") AS "total_energy_potential",
        SUM("carbon_offset_metric_tons") AS "total_carbon_offset",
        SUM("existing_installs_count") AS "current_installations",
        SUM("count_qualified" * "percent_covered" / 100 * "percent_qualified" / 100) - SUM("existing_installs_count") AS "installation_gap"
    FROM "SUNROOF_SOLAR_SUNROOF_SOLAR"."SOLAR_POTENTIAL_BY_CENSUSTRACT"
    WHERE "state_name" IS NOT NULL
    GROUP BY "state_name"
) AS combined_data
ORDER BY "state", "level";