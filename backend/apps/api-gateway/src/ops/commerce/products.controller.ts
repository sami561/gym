import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PATTERNS, ProductDto, Role, Roles, RpcClient } from '@app/common';
import { CreateProductDto, ListProductsQuery, UpdateProductDto } from './commerce.dto';

@ApiTags('Boutique — produits')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('products')
export class ProductsController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListProductsQuery) {
    return this.rpc.send<ProductDto[]>(PATTERNS.products.list, q);
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.rpc.send<ProductDto>(PATTERNS.products.create, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.rpc.send<ProductDto>(PATTERNS.products.update, { id, data: dto });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.products.remove, { id });
  }
}
