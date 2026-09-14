import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app.component';

bootstrapApplication(AppComponent).catch((error: unknown) => {
    console.error('Failed to bootstrap renderer', error);
});
