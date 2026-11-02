import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusModule, databaseModule } from '@app/common';
import { AppController } from './app.controller';
import { Product } from './products/product.entity';
import { StockMovement } from './products/stock-movement.entity';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { Sale } from './sales/sale.entity';
import { Counter } from './sales/counter.entity';
import { SalesController } from './sales/sales.controller';
import { SalesService } from './sales/sales.service';
import { Expense } from './expenses/expense.entity';
import { ExpensesController } from './expenses/expenses.controller';
import { ExpensesService } from './expenses/expenses.service';
import { FinanceController } from './finance/finance.controller';
import { FinanceService } from './finance/finance.service';

@Module({
  imports: [
    databaseModule('commerce'),
    TypeOrmModule.forFeature([Product, StockMovement, Sale, Counter, Expense]),
    BusModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController, ProductsController, SalesController, ExpensesController, FinanceController],
  providers: [ProductsService, SalesService, ExpensesService, FinanceService],
})
export class AppModule {}
