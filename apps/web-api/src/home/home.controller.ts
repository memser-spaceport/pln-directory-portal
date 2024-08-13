import { Controller, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiHome } from 'libs/contracts/src/lib/contract-home';
import { HomeService } from './home.service';

const server = initNestServer(apiHome);
type RouteShape = typeof server.routeShapes;

@Controller()
export class HomeController {
  constructor(private homeService: HomeService) {}
  
  @Api(server.route.getAllFeaturedData)
  async getAllFeaturedData(@Req() request: Request) {
    return await this.homeService.fetchAllFeaturedData();
  }
}
