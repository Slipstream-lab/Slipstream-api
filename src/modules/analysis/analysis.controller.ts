import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AnalysisService } from './analysis.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post()
  @ApiOperation({
    summary: 'Enqueue (or run inline) an analysis job for a contract',
  })
  @ApiCreatedResponse({ description: 'The created analysis job.' })
  create(@Body() dto: CreateAnalysisDto) {
    return this.analysis.create(dto);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get an analysis job status' })
  @ApiOkResponse({ description: 'The analysis job.' })
  getJob(@Param('id') id: string) {
    return this.analysis.getJob(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a completed analysis with findings' })
  @ApiOkResponse({ description: 'The analysis.' })
  findOne(@Param('id') id: string) {
    return this.analysis.findOne(id);
  }

  @Get()
  @ApiOperation({ summary: 'List analyses for a contract' })
  @ApiQuery({ name: 'contractId', required: true })
  @ApiOkResponse({ description: 'Analyses, newest first.' })
  findForContract(@Query('contractId') contractId: string) {
    return this.analysis.findForContract(contractId);
  }
}
