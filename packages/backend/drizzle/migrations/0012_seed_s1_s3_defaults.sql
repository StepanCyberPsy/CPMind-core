INSERT INTO s1_weibull_configs (segment_key, k, lambda, sample_size, is_active)
VALUES ('global', 1.0, 5.0, 0, true)
ON CONFLICT DO NOTHING;

INSERT INTO s3_logistic_configs (
  segment_key, tag_constants_version,
  coefficients, feature_means, feature_stds,
  sample_size, is_active
) VALUES (
  'global', 'v0',
  '{"beta0":0,"beta1":0,"beta2":0,"beta3":0,"beta4":0,"beta5":0,"beta6":0,"beta7":0}',
  '{"speed":0,"stddev":0,"pause":0,"direction":0,"streak":0}',
  '{"speed":1,"stddev":1,"pause":1,"direction":1,"streak":1}',
  0, true
)
ON CONFLICT DO NOTHING;