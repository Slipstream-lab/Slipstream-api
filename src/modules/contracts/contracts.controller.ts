import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ContractsService } from './contracts.service';
import { IngestContractDto } from './dto/ingest-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

@ApiTags('contracts')
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Post()
  @ApiOperation({ summary: 'Ingest (register) a contract' })
  @ApiCreatedResponse({ description: 'The ingested contract.' })
  ingest(@Body() dto: IngestContractDto) {
    return this.contracts.ingest(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List contracts' })
  @ApiOkResponse({ description: 'A page of contracts.' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.contracts.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a contract and its metadata' })
  @ApiOkResponse({ description: 'The contract.' })
  findOne(@Param('id') id: string) {
    return this.contracts.findOne(id);
  }

  @Get(':id/grade-history')
  @ApiOperation({ summary: 'Get a contract grade-over-time history' })
  @ApiOkResponse({ description: 'Grade history, oldest first.' })
  gradeHistory(@Param('id') id: string) {
    return this.contracts.gradeHistory(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contract metadata' })
  @ApiOkResponse({ description: 'The updated contract.' })
  update(@Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.contracts.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a contract' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  remove(@Param('id') id: string) {
    return this.contracts.remove(id);
  }
}
