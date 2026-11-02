import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateProductRequest,
  CreateStockMovementRequest,
  IdRequest,
  ListProductsRequest,
  ListStockMovementsRequest,
  OkResult,
  PATTERNS,
  ProductDto,
  StockMovementDto,
  UpdateProductRequest,
} from '@app/common';
import { ProductsService } from './products.service';

@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @MessagePattern(PATTERNS.products.list)
  list(@Payload() request: ListProductsRequest): Promise<ProductDto[]> {
    return this.products.list(request ?? {});
  }

  @MessagePattern(PATTERNS.products.create)
  create(@Payload() request: CreateProductRequest): Promise<ProductDto> {
    return this.products.create(request);
  }

  @MessagePattern(PATTERNS.products.update)
  update(@Payload() request: UpdateProductRequest): Promise<ProductDto> {
    return this.products.update({ id: request.id, data: request.data ?? {} });
  }

  @MessagePattern(PATTERNS.products.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.products.remove(request);
  }

  @MessagePattern(PATTERNS.stock.move)
  move(@Payload() request: CreateStockMovementRequest): Promise<StockMovementDto> {
    return this.products.move(request);
  }

  @MessagePattern(PATTERNS.stock.movements)
  movements(@Payload() request: ListStockMovementsRequest): Promise<StockMovementDto[]> {
    return this.products.listMovements(request ?? {});
  }
}
