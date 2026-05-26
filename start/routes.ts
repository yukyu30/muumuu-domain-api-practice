/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
const DomainsController = () => import('#controllers/domains_controller')

router.on('/').render('pages/home')
router.get('/domains', [DomainsController, 'index'])
