import { bootstrapHybridService, envInt, loadEnv } from '@app/common';
import { AppModule } from './app.module';

loadEnv();
void bootstrapHybridService(AppModule, 'access-service', envInt('ACCESS_WS_PORT', 4004));
