import { recalibrateS1Weibull } from '../jobs/s1_weibull_recalibration.js';
import { recalibrateS3Logistic } from '../jobs/s3_logistic_recalibration.js';
import { recalibrateS4 } from '../jobs/s4_calibration.js';

await recalibrateS1Weibull();
await recalibrateS3Logistic();
await recalibrateS4();