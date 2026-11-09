// Deterministic, synthetic data only. Shared by browser and DuckDB-WASM checks.
export const wideMetrics=Array.from({length:32},(_,i)=>`metric_${String(i).padStart(2,'0')}`);
export const wideRows=50_000;
export const wideTableSql=`CREATE TABLE dashboard_wide AS SELECT i::INTEGER AS id,
 'R'||(i%8)::VARCHAR AS region, 'C'||((i//8)%4)::VARCHAR AS category,
 DATE '2025-01-01'+((i//32)%30)::INTEGER AS day,
 ${wideMetrics.map((name,index)=>`((i*${index+1})%1000)::INTEGER AS ${name}`).join(',\n ')}
 FROM range(${wideRows}) t(i)`;
